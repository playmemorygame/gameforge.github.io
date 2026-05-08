import type {
  FrameAnalysis, ColorInfo, MotionData, EdgeData, DetectedObject,
  CameraAnalysis, MovementAnalysis, MechanicsAnalysis, EnvironmentAnalysis,
  VFXAnalysis, UIAnalysis, AnimationAnalysis, PacingAnalysis, GameAnalysisResult
} from '../types';

// ===== FRAME EXTRACTION =====
export function extractFrames(
  video: HTMLVideoElement,
  interval: number,
  maxFrames: number,
  onProgress?: (pct: number) => void
): Promise<{ canvas: HTMLCanvasElement; timestamp: number }[]> {
  return new Promise((resolve) => {
    const frames: { canvas: HTMLCanvasElement; timestamp: number }[] = [];
    const duration = video.duration;
    const w = Math.min(video.videoWidth, 640);
    const h = Math.round((w / video.videoWidth) * video.videoHeight);
    let currentTime = 0;
    let count = 0;

    const captureFrame = () => {
      if (currentTime >= duration || count >= maxFrames) {
        onProgress?.(100);
        resolve(frames);
        return;
      }
      video.currentTime = currentTime;
    };

    video.addEventListener('seeked', function onSeeked() {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0, w, h);
      frames.push({ canvas, timestamp: currentTime });
      count++;
      currentTime += interval;
      onProgress?.(Math.min(99, Math.round((currentTime / duration) * 100)));
      captureFrame();
    });

    captureFrame();
  });
}

// ===== COLOR ANALYSIS =====
export function analyzeColors(imageData: ImageData): ColorInfo {
  const data = imageData.data;
  const totalPixels = data.length / 4;
  let rSum = 0, gSum = 0, bSum = 0;
  let brightnessSum = 0;
  let minB = 255, maxB = 0;
  let satSum = 0;
  let warmSum = 0;

  const colorBuckets: Record<string, number> = {};

  for (let i = 0; i < data.length; i += 16) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    rSum += r; gSum += g; bSum += b;
    const brightness = (r * 0.299 + g * 0.587 + b * 0.114);
    brightnessSum += brightness;
    if (brightness < minB) minB = brightness;
    if (brightness > maxB) maxB = brightness;

    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    satSum += sat;
    warmSum += (r - b) / 255;

    const bucketR = Math.round(r / 32) * 32;
    const bucketG = Math.round(g / 32) * 32;
    const bucketB = Math.round(b / 32) * 32;
    const key = `${bucketR},${bucketG},${bucketB}`;
    colorBuckets[key] = (colorBuckets[key] || 0) + 1;
  }

  const sampledPixels = totalPixels / 4;
  const avgR = Math.round(rSum / sampledPixels);
  const avgG = Math.round(gSum / sampledPixels);
  const avgB = Math.round(bSum / sampledPixels);
  const avgBrightness = brightnessSum / sampledPixels;
  const contrast = maxB - minB;
  const saturation = satSum / sampledPixels;
  const warmth = warmSum / sampledPixels;

  const sortedBuckets = Object.entries(colorBuckets)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const palette = sortedBuckets.map(([key]) => {
    const [r, g, b] = key.split(',').map(Number);
    return `rgb(${r},${g},${b})`;
  });

  return {
    dominant: `rgb(${avgR},${avgG},${avgB})`,
    palette,
    avgBrightness: avgBrightness / 255,
    contrast: contrast / 255,
    saturation,
    warmth,
  };
}

// ===== MOTION DETECTION (Frame Differencing) =====
export function detectMotion(prev: ImageData, curr: ImageData): MotionData {
  const data1 = prev.data;
  const data2 = curr.data;
  const w = curr.width;
  const h = curr.height;
  let totalDiff = 0;
  let dirX = 0, dirY = 0;
  const regions: MotionData['regions'] = [];

  const blockW = Math.floor(w / 8);
  const blockH = Math.floor(h / 6);

  for (let by = 0; by < 6; by++) {
    for (let bx = 0; bx < 8; bx++) {
      let blockDiff = 0;
      const startX = bx * blockW;
      const startY = by * blockH;

      for (let y = startY; y < startY + blockH && y < h; y += 2) {
        for (let x = startX; x < startX + blockW && x < w; x += 2) {
          const i = (y * w + x) * 4;
          const diff = Math.abs(data1[i] - data2[i]) +
            Math.abs(data1[i + 1] - data2[i + 1]) +
            Math.abs(data1[i + 2] - data2[i + 2]);
          blockDiff += diff / 3;
        }
      }

      const avgDiff = blockDiff / (blockW * blockH / 4);
      if (avgDiff > 8) {
        regions.push({
          x: startX, y: startY, w: blockW, h: blockH,
          intensity: Math.min(avgDiff / 50, 1)
        });
        totalDiff += avgDiff;
        dirX += (bx - 4) * avgDiff;
        dirY += (by - 3) * avgDiff;
      }
    }
  }

  const magnitude = Math.min(totalDiff / (w * h * 0.1), 1);
  const norm = Math.sqrt(dirX * dirX + dirY * dirY) || 1;

  return {
    magnitude,
    direction: { x: dirX / norm, y: dirY / norm },
    regions,
  };
}

// ===== EDGE DETECTION (Simplified Sobel) =====
export function detectEdges(imageData: ImageData): EdgeData {
  const w = imageData.width;
  const h = imageData.height;
  const data = imageData.data;
  let edgeSum = 0;
  let hEdges = 0;
  let vEdges = 0;
  let pixelCount = 0;

  for (let y = 2; y < h - 2; y += 3) {
    for (let x = 2; x < w - 2; x += 3) {
      const tl = data[((y - 1) * w + (x - 1)) * 4];
      const t = data[((y - 1) * w + x) * 4];
      const tr = data[((y - 1) * w + (x + 1)) * 4];
      const l = data[(y * w + (x - 1)) * 4];
      const r = data[(y * w + (x + 1)) * 4];
      const bl = data[((y + 1) * w + (x - 1)) * 4];
      const b = data[((y + 1) * w + x) * 4];
      const br = data[((y + 1) * w + (x + 1)) * 4];

      const gx = -tl - 2 * l - bl + tr + 2 * r + br;
      const gy = -tl - 2 * t - tr + bl + 2 * b + br;
      const mag = Math.sqrt(gx * gx + gy * gy);

      edgeSum += mag;
      if (Math.abs(gx) > 50) vEdges++;
      if (Math.abs(gy) > 50) hEdges++;
      pixelCount++;
    }
  }

  const edgeDensity = edgeSum / (pixelCount * 255);
  return {
    edgeDensity,
    horizontalEdges: hEdges / pixelCount,
    verticalEdges: vEdges / pixelCount,
    complexity: Math.min(edgeDensity * 3, 1),
  };
}

// ===== HEURISTIC OBJECT DETECTION =====
export function detectObjectsHeuristic(
  imageData: ImageData,
  timestamp: number
): DetectedObject[] {
  const objects: DetectedObject[] = [];
  const w = imageData.width;
  const h = imageData.height;
  const data = imageData.data;

  // Detect bright/colored regions as potential game objects
  const blockSize = 32;
  const blocksX = Math.floor(w / blockSize);
  const blocksY = Math.floor(h / blockSize);

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      let brightPixels = 0;

      for (let y = by * blockSize; y < (by + 1) * blockSize; y += 2) {
        for (let x = bx * blockSize; x < (bx + 1) * blockSize; x += 2) {
          const i = (y * w + x) * 4;
          rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2];
          const brightness = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          if (brightness > 180) brightPixels++;
          count++;
        }
      }

      const avgR = rSum / count;
      const avgG = gSum / count;
      const avgB = bSum / count;
      const brightRatio = brightPixels / count;

      // Detect glowing/collectible objects (bright, saturated regions)
      if (brightRatio > 0.4) {
        const max = Math.max(avgR, avgG, avgB);
        const min = Math.min(avgR, avgG, avgB);
        const sat = max === 0 ? 0 : (max - min) / max;

        if (sat > 0.4) {
          let label = 'glow_object';
          let color = '#00f0ff';

          if (avgR > avgG && avgR > avgB) {
            label = 'red_object';
            color = '#ff4444';
          } else if (avgG > avgR && avgG > avgB) {
            label = 'green_object';
            color = '#44ff44';
          } else if (avgB > avgR && avgB > avgG) {
            label = 'blue_object';
            color = '#4488ff';
          } else if (avgR > 200 && avgG > 180) {
            label = 'golden_object';
            color = '#ffd700';
          }

          objects.push({
            label,
            confidence: Math.min(brightRatio * sat * 1.5, 0.95),
            bbox: {
              x: bx * blockSize / w,
              y: by * blockSize / h,
              w: blockSize / w,
              h: blockSize / h,
            },
            color,
            timestamp,
          });
        }
      }

      // Detect dark regions as potential obstacles/shadows
      const avgBrightness = (avgR + avgG + avgB) / 3;
      if (avgBrightness < 30 && by > blocksY * 0.3) {
        objects.push({
          label: 'dark_region',
          confidence: 0.5,
          bbox: {
            x: bx * blockSize / w,
            y: by * blockSize / h,
            w: blockSize / w,
            h: blockSize / h,
          },
          color: '#333355',
          timestamp,
        });
      }
    }
  }

  // Detect UI elements (top/bottom edges with high contrast)
  const topStrip = analyzeStrip(data, w, 0, Math.floor(h * 0.08));
  const bottomStrip = analyzeStrip(data, w, Math.floor(h * 0.92), h);

  if (topStrip.contrast > 0.3 || topStrip.brightRatio > 0.15) {
    objects.push({
      label: 'ui_element_top',
      confidence: 0.7,
      bbox: { x: 0, y: 0, w: 1, h: 0.08 },
      color: '#a855f7',
      timestamp,
    });
  }
  if (bottomStrip.contrast > 0.3 || bottomStrip.brightRatio > 0.15) {
    objects.push({
      label: 'ui_element_bottom',
      confidence: 0.7,
      bbox: { x: 0, y: 0.92, w: 1, h: 0.08 },
      color: '#a855f7',
      timestamp,
    });
  }

  return objects;
}

function analyzeStrip(data: Uint8ClampedArray, w: number, startY: number, endY: number) {
  let brightPixels = 0;
  let totalPixels = 0;
  let minB = 255, maxB = 0;

  for (let y = startY; y < endY; y += 2) {
    for (let x = 0; x < w; x += 4) {
      const i = (y * w + x) * 4;
      const b = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      if (b > 150) brightPixels++;
      if (b < minB) minB = b;
      if (b > maxB) maxB = b;
      totalPixels++;
    }
  }

  return {
    brightRatio: brightPixels / totalPixels,
    contrast: (maxB - minB) / 255,
  };
}

// ===== SCENE CLASSIFICATION =====
export function classifyScene(colors: ColorInfo, edges: EdgeData, _motion: MotionData): string {
  const { avgBrightness, saturation, warmth } = colors;
  const { edgeDensity, verticalEdges, horizontalEdges } = edges;

  // Environment style detection
  if (saturation > 0.5 && warmth < -0.1) return 'cyberpunk';
  if (saturation > 0.4 && warmth > 0.2) return 'fantasy';
  if (avgBrightness < 0.25 && saturation > 0.3) return 'neon_sci_fi';
  if (avgBrightness > 0.6 && saturation < 0.3) return 'realistic_outdoor';
  if (warmth > 0.3 && saturation > 0.3 && avgBrightness > 0.4) return 'desert';
  if (saturation > 0.35 && warmth > 0.05 && warmth < 0.2 && avgBrightness > 0.3) return 'jungle';
  if (avgBrightness < 0.3 && edgeDensity > 0.15) return 'dark_urban';
  if (verticalEdges > horizontalEdges * 1.5 && edgeDensity > 0.1) return 'urban_city';
  if (horizontalEdges > verticalEdges * 1.3) return 'side_scroller';
  if (saturation < 0.15 && avgBrightness > 0.5) return 'minimalist';
  return 'mixed_environment';
}

// ===== FULL FRAME ANALYSIS =====
export function analyzeFrame(
  canvas: HTMLCanvasElement,
  timestamp: number,
  frameIndex: number,
  prevCanvas?: HTMLCanvasElement
): FrameAnalysis {
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const colors = analyzeColors(imageData);
  const edges = detectEdges(imageData);

  let motion: MotionData = { magnitude: 0, direction: { x: 0, y: 0 }, regions: [] };
  if (prevCanvas) {
    const prevCtx = prevCanvas.getContext('2d')!;
    const prevData = prevCtx.getImageData(0, 0, prevCanvas.width, prevCanvas.height);
    motion = detectMotion(prevData, imageData);
  }

  const objects = detectObjectsHeuristic(imageData, timestamp);
  const sceneType = classifyScene(colors, edges, motion);

  return {
    timestamp,
    frameIndex,
    colors,
    motion,
    edges,
    objects,
    brightness: colors.avgBrightness,
    sceneType,
  };
}

// ===== HIGH-LEVEL GAME ANALYSIS =====
export function analyzeGameplay(frameAnalyses: FrameAnalysis[]): GameAnalysisResult {
  const camera = analyzeCamera(frameAnalyses);
  const movement = analyzeMovement(frameAnalyses);
  const mechanics = analyzeMechanics(frameAnalyses, camera, movement);
  const environment = analyzeEnvironment(frameAnalyses);
  const vfx = analyzeVFX(frameAnalyses);
  const ui = analyzeUI(frameAnalyses);
  const animation = analyzeAnimation(frameAnalyses);
  const pacing = analyzePacing(frameAnalyses);

  const allObjects = frameAnalyses.flatMap(f => f.objects);
  const uniqueLabels = [...new Set(allObjects.map(o => o.label))];

  const summary = generateSummary(camera, movement, mechanics, environment, vfx);
  const tags = generateTags(mechanics, environment, camera, vfx);
  const jsonData = generateJsonData(camera, movement, mechanics, environment, vfx, ui, uniqueLabels);
  const prompts = generatePrompts(camera, movement, mechanics, environment, vfx, ui);
  const difficulty = estimateDifficulty(frameAnalyses, mechanics);
  const engagementPrediction = estimateEngagement(pacing, vfx, mechanics);
  const similarGames = findSimilarGames(mechanics, environment, camera);

  return {
    gameType: mechanics.gameType,
    camera,
    movement,
    mechanics,
    environment,
    vfx,
    ui,
    animation,
    pacing,
    objects: allObjects,
    frameAnalyses,
    summary,
    tags,
    jsonData,
    prompts,
    difficulty,
    engagementPrediction,
    similarGames,
  };
}

function analyzeCamera(frames: FrameAnalysis[]): CameraAnalysis {
  const avgMotion = frames.reduce((s, f) => s + f.motion.magnitude, 0) / frames.length;
  const motionVariance = frames.reduce((s, f) => s + Math.pow(f.motion.magnitude - avgMotion, 2), 0) / frames.length;
  const avgVertEdges = frames.reduce((s, f) => s + f.edges.verticalEdges, 0) / frames.length;
  const avgHorizEdges = frames.reduce((s, f) => s + f.edges.horizontalEdges, 0) / frames.length;

  let type = 'third_person';
  if (avgHorizEdges > avgVertEdges * 1.3) type = 'side_scrolling';
  else if (avgVertEdges > avgHorizEdges * 1.5) type = 'top_down';
  else if (motionVariance > 0.05) type = 'dynamic_third_person';

  const shakeDetected = motionVariance > 0.03;
  const zoomDetected = frames.some((f, i) =>
    i > 0 && Math.abs(f.edges.edgeDensity - frames[i - 1].edges.edgeDensity) > 0.05
  );

  const centerMotion = frames.reduce((s, f) => {
    const centerRegions = f.motion.regions.filter(r =>
      r.x > 0.3 && r.x < 0.7 && r.y > 0.3 && r.y < 0.7
    );
    return s + centerRegions.length;
  }, 0);

  return {
    type,
    movement: avgMotion > 0.3 ? 'fast_following' : avgMotion > 0.1 ? 'smooth_following' : 'static',
    shakeDetected,
    zoomDetected,
    followCam: centerMotion > frames.length * 0.3,
    confidence: 0.75,
  };
}

function analyzeMovement(frames: FrameAnalysis[]): MovementAnalysis {
  const avgMotion = frames.reduce((s, f) => s + f.motion.magnitude, 0) / frames.length;
  const motionDir = frames.reduce(
    (acc, f) => ({ x: acc.x + f.motion.direction.x, y: acc.y + f.motion.direction.y }),
    { x: 0, y: 0 }
  );

  const motionHistory = frames.map(f => f.motion.magnitude);
  const spikes = motionHistory.filter((m, i) =>
    i > 0 && m - motionHistory[i - 1] > 0.15
  ).length;

  const downwardMotion = motionDir.y > 0;
  const horizontalMotion = Math.abs(motionDir.x) > Math.abs(motionDir.y);

  return {
    primaryMotion: avgMotion > 0.4 ? 'fast_running' : avgMotion > 0.15 ? 'running' : avgMotion > 0.05 ? 'walking' : 'idle',
    speed: Math.round(avgMotion * 100),
    direction: horizontalMotion ? 'horizontal' : downwardMotion ? 'forward' : 'vertical',
    jumpDetected: spikes > 2,
    slideDetected: frames.some(f => f.motion.direction.y > 0.5 && f.motion.magnitude > 0.2),
    laneSwitching: Math.abs(motionDir.x) > frames.length * 0.3,
    running: avgMotion > 0.15,
  };
}

function analyzeMechanics(
  frames: FrameAnalysis[],
  camera: CameraAnalysis,
  movement: MovementAnalysis
): MechanicsAnalysis {
  const avgMotion = frames.reduce((s, f) => s + f.motion.magnitude, 0) / frames.length;
  const objectTypes = [...new Set(frames.flatMap(f => f.objects.map(o => o.label)))];
  const hasGlowObjects = objectTypes.some(l => l.includes('glow') || l.includes('golden'));
  const hasDarkRegions = objectTypes.includes('dark_region');
  const hasUI = objectTypes.some(l => l.includes('ui'));

  const mechanics: string[] = [];
  const confidence: Record<string, number> = {};

  // Determine game type
  let gameType = 'action';

  if (camera.type === 'side_scrolling' && movement.running) {
    gameType = 'side_scrolling_runner';
    mechanics.push('endless_running', 'obstacle_avoidance');
    confidence['endless_running'] = 0.8;
  } else if (movement.running && avgMotion > 0.2) {
    gameType = 'endless_runner';
    mechanics.push('endless_running', 'obstacle_avoidance', 'coin_collection');
    confidence['endless_runner'] = 0.85;
  } else if (camera.type === 'top_down') {
    gameType = 'top_down_action';
    mechanics.push('top_down_movement', 'combat');
    confidence['top_down_action'] = 0.7;
  } else if (movement.jumpDetected) {
    gameType = 'platformer';
    mechanics.push('jumping', 'platforming', 'obstacle_avoidance');
    confidence['platformer'] = 0.75;
  }

  if (hasGlowObjects) {
    mechanics.push('collectibles');
    confidence['collectibles'] = 0.8;
  }
  if (hasDarkRegions) {
    mechanics.push('obstacles');
    confidence['obstacles'] = 0.65;
  }
  if (movement.laneSwitching) {
    mechanics.push('lane_switching');
    confidence['lane_switching'] = 0.7;
  }
  if (movement.slideDetected) {
    mechanics.push('sliding');
    confidence['sliding'] = 0.65;
  }
  if (hasUI) {
    mechanics.push('hud_system');
    confidence['hud_system'] = 0.7;
  }

  // Check for combat-like patterns
  const motionSpikes = frames.filter((f, i) =>
    i > 0 && Math.abs(f.motion.magnitude - frames[i - 1].motion.magnitude) > 0.2
  ).length;
  if (motionSpikes > frames.length * 0.1) {
    mechanics.push('combat_system');
    confidence['combat_system'] = 0.55;
  }

  mechanics.push('score_system');
  confidence['score_system'] = 0.6;

  return { gameType, mechanics, confidence };
}

function analyzeEnvironment(frames: FrameAnalysis[]): EnvironmentAnalysis {
  const sceneCounts: Record<string, number> = {};
  frames.forEach(f => {
    sceneCounts[f.sceneType] = (sceneCounts[f.sceneType] || 0) + 1;
  });

  const dominantScene = Object.entries(sceneCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'mixed';

  const _avgColors = {
    r: frames.reduce((s, f) => s + parseInt(f.colors.dominant.match(/\d+/g)?.[0] || '128'), 0) / frames.length,
    g: frames.reduce((s, f) => s + parseInt(f.colors.dominant.match(/\d+/g)?.[1] || '128'), 0) / frames.length,
    b: frames.reduce((s, f) => s + parseInt(f.colors.dominant.match(/\d+/g)?.[2] || '128'), 0) / frames.length,
  };
  void _avgColors;

  const avgBrightness = frames.reduce((s, f) => s + f.brightness, 0) / frames.length;

  const sceneMap: Record<string, { style: string; setting: string; mood: string }> = {
    cyberpunk: { style: 'Cyberpunk', setting: 'Neon-lit urban environment', mood: 'Dark and atmospheric' },
    fantasy: { style: 'Fantasy', setting: 'Magical landscape', mood: 'Mystical and vibrant' },
    neon_sci_fi: { style: 'Sci-Fi', setting: 'Futuristic neon environment', mood: 'Electric and immersive' },
    realistic_outdoor: { style: 'Realistic', setting: 'Outdoor environment', mood: 'Natural and bright' },
    desert: { style: 'Desert', setting: 'Arid landscape', mood: 'Hot and expansive' },
    jungle: { style: 'Jungle', setting: 'Tropical forest', mood: 'Dense and adventurous' },
    dark_urban: { style: 'Dark Urban', setting: 'City at night', mood: 'Gritty and tense' },
    urban_city: { style: 'Urban', setting: 'City environment', mood: 'Bustling and dynamic' },
    side_scroller: { style: 'Side-Scrolling', setting: '2D plane environment', mood: 'Classic and focused' },
    minimalist: { style: 'Minimalist', setting: 'Clean environment', mood: 'Simple and elegant' },
    mixed_environment: { style: 'Mixed', setting: 'Varied environment', mood: 'Dynamic and diverse' },
  };

  const sceneInfo = sceneMap[dominantScene] || sceneMap.mixed_environment;
  const timeOfDay = avgBrightness > 0.6 ? 'day' : avgBrightness > 0.35 ? 'dusk' : 'night';
  const lighting = avgBrightness > 0.5 ? 'bright' : avgBrightness > 0.3 ? 'ambient' : 'dark';

  const allPalette = frames.flatMap(f => f.colors.palette);
  const uniquePalette = [...new Set(allPalette)].slice(0, 6);

  return {
    style: sceneInfo.style,
    setting: sceneInfo.setting,
    timeOfDay,
    lighting,
    palette: uniquePalette,
    mood: sceneInfo.mood,
  };
}

function analyzeVFX(frames: FrameAnalysis[]): VFXAnalysis {
  const effects: string[] = [];

  const highBrightnessFrames = frames.filter(f => f.brightness > 0.7).length;
  const glowDetected = highBrightnessFrames > frames.length * 0.1;
  if (glowDetected) effects.push('glow_effects');

  const avgMotion = frames.reduce((s, f) => s + f.motion.magnitude, 0) / frames.length;
  const motionBlur = avgMotion > 0.3;
  if (motionBlur) effects.push('motion_blur');

  const saturationVariance = frames.reduce((s, f) => {
    const avgSat = frames.reduce((sum, fr) => sum + fr.colors.saturation, 0) / frames.length;
    return s + Math.pow(f.colors.saturation - avgSat, 2);
  }, 0) / frames.length;

  const bloom = saturationVariance > 0.01 && glowDetected;
  if (bloom) effects.push('bloom');

  const avgEdgeDensity = frames.reduce((s, f) => s + f.edges.edgeDensity, 0) / frames.length;
  const shadows = avgEdgeDensity > 0.12;
  if (shadows) effects.push('dynamic_shadows');

  const contrastVariance = frames.reduce((s, f) => {
    const avgC = frames.reduce((sum, fr) => sum + fr.colors.contrast, 0) / frames.length;
    return s + Math.pow(f.colors.contrast - avgC, 2);
  }, 0) / frames.length;
  const postProcessing = contrastVariance > 0.005;
  if (postProcessing) effects.push('post_processing');

  const brightSpikes = frames.filter((f, i) =>
    i > 0 && f.brightness - frames[i - 1].brightness > 0.2
  ).length;
  const particles = brightSpikes > 1;
  if (particles) effects.push('particle_effects');

  return {
    particles,
    glow: glowDetected,
    motionBlur,
    bloom,
    shadows,
    postProcessing,
    effects,
  };
}

function analyzeUI(frames: FrameAnalysis[]): UIAnalysis {
  const uiFrames = frames.filter(f =>
    f.objects.some(o => o.label.includes('ui'))
  );

  const hasHUD = uiFrames.length > frames.length * 0.3;
  const topUI = frames.filter(f =>
    f.objects.some(o => o.label === 'ui_element_top')
  ).length;
  const bottomUI = frames.filter(f =>
    f.objects.some(o => o.label === 'ui_element_bottom')
  ).length;

  const elements: string[] = [];
  if (topUI > frames.length * 0.2) elements.push('top_hud');
  if (bottomUI > frames.length * 0.2) elements.push('bottom_bar');
  if (hasHUD) elements.push('score_display');

  return {
    hasHUD,
    hasScore: hasHUD,
    hasMinimap: false,
    hasButtons: bottomUI > frames.length * 0.3,
    hasHealthBar: topUI > frames.length * 0.4,
    elements,
  };
}

function analyzeAnimation(frames: FrameAnalysis[]): AnimationAnalysis {
  const motionValues = frames.map(f => f.motion.magnitude);
  const diffs: number[] = [];
  for (let i = 1; i < motionValues.length; i++) {
    diffs.push(Math.abs(motionValues[i] - motionValues[i - 1]));
  }

  const avgDiff = diffs.reduce((s, d) => s + d, 0) / diffs.length;
  const smoothness = Math.max(0, 1 - avgDiff * 5);

  const consistentFrames = diffs.filter(d => d < 0.1).length;
  const consistency = consistentFrames / diffs.length;

  return {
    smoothness,
    frameRate: 30,
    motionConsistency: consistency,
    animationType: smoothness > 0.7 ? 'smooth_interpolated' : smoothness > 0.4 ? 'standard' : 'choppy',
  };
}

function analyzePacing(frames: FrameAnalysis[]): PacingAnalysis {
  const motionValues = frames.map(f => f.motion.magnitude);
  const avgIntensity = motionValues.reduce((s, v) => s + v, 0) / motionValues.length;
  const variance = motionValues.reduce((s, v) => s + Math.pow(v - avgIntensity, 2), 0) / motionValues.length;

  const tempo = avgIntensity > 0.3 ? 'fast' : avgIntensity > 0.15 ? 'moderate' : 'slow';
  const engagementScore = Math.min(
    (avgIntensity * 40 + variance * 100 + (frames.length > 20 ? 20 : 10)),
    100
  );

  return {
    intensity: Math.round(avgIntensity * 100),
    variation: Math.round(variance * 100),
    tempo,
    engagementScore: Math.round(engagementScore),
  };
}

function generateSummary(
  camera: CameraAnalysis,
  movement: MovementAnalysis,
  mechanics: MechanicsAnalysis,
  environment: EnvironmentAnalysis,
  vfx: VFXAnalysis
): string {
  const motionDesc = movement.running ? 'running through' : movement.primaryMotion === 'walking' ? 'navigating' : 'moving through';
  const envDesc = `${environment.style.toLowerCase()} ${environment.setting.toLowerCase()}`;
  const cameraDesc = camera.type.replace(/_/g, ' ');
  const mechanicList = mechanics.mechanics.slice(0, 3).map(m => m.replace(/_/g, ' ')).join(', ');
  const vfxDesc = vfx.effects.length > 0 ? `with ${vfx.effects.slice(0, 2).join(' and ')}` : '';

  return `The player is ${motionDesc} a ${envDesc} in a ${mechanics.gameType.replace(/_/g, ' ')} game. ` +
    `Viewed from a ${cameraDesc} camera perspective, the gameplay features ${mechanicList} ${vfxDesc}. ` +
    `The ${environment.mood.toLowerCase()} environment has ${environment.lighting} lighting with a ${environment.timeOfDay}time setting. ` +
    `${movement.jumpDetected ? 'Jump mechanics are detected. ' : ''}` +
    `${movement.laneSwitching ? 'Lane-switching movement is present. ' : ''}` +
    `The game features ${vfx.effects.length} visual effects and ${mechanics.mechanics.length} core mechanics.`;
}

function generateTags(
  mechanics: MechanicsAnalysis,
  environment: EnvironmentAnalysis,
  camera: CameraAnalysis,
  vfx: VFXAnalysis
): string[] {
  return [
    mechanics.gameType,
    environment.style,
    camera.type,
    ...mechanics.mechanics.slice(0, 4),
    ...vfx.effects.slice(0, 3),
    environment.timeOfDay,
    environment.lighting,
  ].map(t => t.replace(/_/g, ' '));
}

function generateJsonData(
  camera: CameraAnalysis,
  movement: MovementAnalysis,
  mechanics: MechanicsAnalysis,
  environment: EnvironmentAnalysis,
  vfx: VFXAnalysis,
  ui: UIAnalysis,
  objectLabels: string[]
): Record<string, unknown> {
  return {
    gameType: mechanics.gameType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    camera: {
      type: camera.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      movement: camera.movement,
      shake: camera.shakeDetected,
      zoom: camera.zoomDetected,
      followCam: camera.followCam,
    },
    movement: {
      primary: movement.primaryMotion,
      speed: movement.speed,
      direction: movement.direction,
      jump: movement.jumpDetected,
      slide: movement.slideDetected,
      laneSwitch: movement.laneSwitching,
      running: movement.running,
    },
    mechanics: {
      detected: mechanics.mechanics,
      confidence: mechanics.confidence,
    },
    environment: {
      style: environment.style,
      setting: environment.setting,
      timeOfDay: environment.timeOfDay,
      lighting: environment.lighting,
      mood: environment.mood,
      palette: environment.palette,
    },
    visualEffects: {
      effects: vfx.effects,
      glow: vfx.glow,
      particles: vfx.particles,
      motionBlur: vfx.motionBlur,
      bloom: vfx.bloom,
      postProcessing: vfx.postProcessing,
    },
    ui: {
      hasHUD: ui.hasHUD,
      elements: ui.elements,
    },
    detectedObjects: objectLabels,
  };
}

function generatePrompts(
  camera: CameraAnalysis,
  movement: MovementAnalysis,
  mechanics: MechanicsAnalysis,
  environment: EnvironmentAnalysis,
  vfx: VFXAnalysis,
  ui: UIAnalysis
): Record<string, string> {
  const base = `Create a ${mechanics.gameType.replace(/_/g, ' ')} game with ${environment.style.toLowerCase()} aesthetics`;
  const cam = `${camera.type.replace(/_/g, ' ')} camera`;
  const move = movement.running ? 'smooth running animations' : 'character movement';
  const mechs = mechanics.mechanics.slice(0, 3).map(m => m.replace(/_/g, ' ')).join(', ');
  const vfxText = vfx.effects.length > 0 ? vfx.effects.slice(0, 3).join(', ') : 'visual polish';
  const envText = `${environment.style} ${environment.setting.toLowerCase()}`;

  return {
    claude: `${base}. The game should feature a ${cam} with ${move}. Include ${mechs} mechanics set in a ${envText}. Add ${vfxText} for visual fidelity. ${ui.hasHUD ? 'Include a clean HUD with score display.' : ''} Focus on responsive controls and engaging gameplay loop.`,

    chatgpt: `Design a ${mechanics.gameType.replace(/_/g, ' ')} game concept: Environment: ${envText}. Camera: ${cam}. Core mechanics: ${mechs}. Visual effects: ${vfxText}. ${movement.jumpDetected ? 'Include jump mechanics with proper physics. ' : ''}${movement.laneSwitching ? 'Implement lane-switching system. ' : ''}Target mobile and PC platforms with optimized performance.`,

    gameEngine: `// Game Configuration\nGameType: ${mechanics.gameType}\nCamera: ${cam}\nMovement: ${movement.primaryMotion}\nMechanics: [${mechs}]\nEnvironment: ${envText}\nVFX: [${vfxText}]\n\n// Implementation Notes\n- Use ${cam} with smooth damping\n- Implement ${move}\n- Add ${mechs} systems\n- Apply ${vfxText}\n- ${environment.lighting} lighting setup`,

    imageGen: `A ${environment.style.toLowerCase()} ${mechanics.gameType.replace(/_/g, ' ')} game screenshot, ${cam} view, ${environment.lighting} lighting, ${environment.mood.toLowerCase()} atmosphere, ${vfx.glow ? 'glowing neon effects, ' : ''}${vfx.particles ? 'particle effects, ' : ''}high quality game art, detailed environment, professional game design`,

    arenaAI: `Build a ${mechanics.gameType.replace(/_/g, ' ')}: ${envText}, ${cam}, mechanics include ${mechs}. ${vfxText} visual effects. ${movement.running ? 'Auto-running gameplay. ' : ''}${ui.hasHUD ? 'HUD with score. ' : ''}Optimize for engagement and replayability.`,
  };
}

function estimateDifficulty(frames: FrameAnalysis[], mechanics: MechanicsAnalysis): number {
  const avgMotion = frames.reduce((s, f) => s + f.motion.magnitude, 0) / frames.length;
  const objectDensity = frames.reduce((s, f) => s + f.objects.length, 0) / frames.length;
  const mechCount = mechanics.mechanics.length;

  return Math.min(Math.round((avgMotion * 30 + objectDensity * 5 + mechCount * 8) * 10) / 10, 100);
}

function estimateEngagement(pacing: PacingAnalysis, vfx: VFXAnalysis, mechanics: MechanicsAnalysis): number {
  return Math.min(
    pacing.engagementScore * 0.4 +
    vfx.effects.length * 8 +
    mechanics.mechanics.length * 6 +
    20,
    100
  );
}

function findSimilarGames(
  mechanics: MechanicsAnalysis,
  environment: EnvironmentAnalysis,
  _camera: CameraAnalysis
): string[] {
  const gameDB: Record<string, string[]> = {
    endless_runner: ['Subway Surfers', 'Temple Run', 'Sonic Dash', 'Minion Rush'],
    side_scrolling_runner: ['Canabalt', 'Geometry Dash', 'Alto\'s Adventure'],
    platformer: ['Celeste', 'Hollow Knight', 'Super Mario Bros', 'Ori'],
    top_down_action: ['Hotline Miami', 'Nuclear Throne', 'Enter the Gungeon'],
    action: ['Devil May Cry', 'Bayonetta', 'Sekiro'],
  };

  const base = gameDB[mechanics.gameType] || gameDB.action;

  if (environment.style === 'Cyberpunk') return [...base.slice(0, 2), 'Cyberpunk 2077', 'Ghostrunner'];
  if (environment.style === 'Fantasy') return [...base.slice(0, 2), 'Genshin Impact', 'Zelda'];
  return base.slice(0, 4);
}
