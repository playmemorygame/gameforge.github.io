import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { GameAnalysisResult } from '../types';

interface Props {
  analysis: GameAnalysisResult | null;
}

export default function ThreePreview({ analysis }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    objects: THREE.Object3D[];
    animationId: number;
  } | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0a1a, 0.02);

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.set(0, 8, 15);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0a0a1a);
    mountRef.current.appendChild(renderer.domElement);

    // Grid
    const gridHelper = new THREE.GridHelper(40, 40, 0x00f0ff, 0x111128);
    (gridHelper.material as THREE.Material).opacity = 0.3;
    (gridHelper.material as THREE.Material).transparent = true;
    scene.add(gridHelper);

    // Ambient light
    const ambient = new THREE.AmbientLight(0x334466, 0.5);
    scene.add(ambient);

    // Point lights
    const light1 = new THREE.PointLight(0x00f0ff, 2, 30);
    light1.position.set(5, 8, 5);
    scene.add(light1);

    const light2 = new THREE.PointLight(0xa855f7, 1.5, 25);
    light2.position.set(-5, 6, -3);
    scene.add(light2);

    const objects: THREE.Object3D[] = [];

    if (analysis) {
      buildScene(scene, objects, analysis);
    } else {
      // Default preview scene
      const playerGeo = new THREE.CapsuleGeometry(0.4, 1, 8, 16);
      const playerMat = new THREE.MeshPhongMaterial({ color: 0x00f0ff, emissive: 0x003344 });
      const player = new THREE.Mesh(playerGeo, playerMat);
      player.position.set(0, 1, 0);
      scene.add(player);
      objects.push(player);

      for (let i = 0; i < 8; i++) {
        const geo = new THREE.BoxGeometry(1, 2 + Math.random() * 3, 1);
        const mat = new THREE.MeshPhongMaterial({
          color: i % 2 === 0 ? 0xa855f7 : 0x22ff88,
          emissive: i % 2 === 0 ? 0x220044 : 0x004422,
          transparent: true,
          opacity: 0.7,
        });
        const box = new THREE.Mesh(geo, mat);
        box.position.set(-8 + i * 2.5, geo.parameters.height / 2, -3 - Math.random() * 5);
        scene.add(box);
        objects.push(box);
      }
    }

    let time = 0;
    const animate = () => {
      time += 0.016;
      objects.forEach((obj, i) => {
        obj.rotation.y += 0.005;
        if (obj.userData.floats) {
          obj.position.y = obj.userData.baseY + Math.sin(time * 2 + i) * 0.3;
        }
        if (obj.userData.moves) {
          obj.position.x = obj.userData.baseX + Math.sin(time + i * 0.5) * obj.userData.moveRange;
        }
      });

      camera.position.x = Math.sin(time * 0.2) * 2;
      camera.lookAt(0, 2, 0);

      renderer.render(scene, camera);
      sceneRef.current!.animationId = requestAnimationFrame(animate);
    };

    sceneRef.current = { scene, camera, renderer, objects, animationId: 0 };
    animate();

    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (sceneRef.current) {
        cancelAnimationFrame(sceneRef.current.animationId);
        sceneRef.current.renderer.dispose();
      }
      if (mountRef.current && renderer.domElement.parentNode === mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, [analysis]);

  return (
    <div ref={mountRef} className="w-full h-full min-h-[400px] rounded-xl overflow-hidden" />
  );
}

function buildScene(
  scene: THREE.Scene,
  objects: THREE.Object3D[],
  analysis: GameAnalysisResult
) {
  const envStyle = analysis.environment.style;
  const isCyberpunk = envStyle === 'Cyberpunk' || envStyle === 'Sci-Fi';
  const isFantasy = envStyle === 'Fantasy';

  const primaryColor = isCyberpunk ? 0x00f0ff : isFantasy ? 0xff66aa : 0x22ff88;
  const secondaryColor = isCyberpunk ? 0xa855f7 : isFantasy ? 0xffaa22 : 0x4488ff;

  // Player
  const playerGeo = new THREE.CapsuleGeometry(0.4, 1, 8, 16);
  const playerMat = new THREE.MeshPhongMaterial({
    color: primaryColor,
    emissive: new THREE.Color(primaryColor).multiplyScalar(0.2),
  });
  const player = new THREE.Mesh(playerGeo, playerMat);
  player.position.set(0, 1, 0);
  player.userData = { floats: true, baseY: 1 };
  scene.add(player);
  objects.push(player);

  // Movement path
  if (analysis.movement.running) {
    const pathPoints: THREE.Vector3[] = [];
    for (let i = 0; i < 20; i++) {
      pathPoints.push(new THREE.Vector3(
        Math.sin(i * 0.5) * 2,
        0.1,
        -i * 2
      ));
    }
    const pathGeo = new THREE.BufferGeometry().setFromPoints(pathPoints);
    const pathMat = new THREE.LineBasicMaterial({ color: primaryColor, transparent: true, opacity: 0.5 });
    const pathLine = new THREE.Line(pathGeo, pathMat);
    scene.add(pathLine);
  }

  // Obstacles
  const obstacleCount = analysis.mechanics.mechanics.includes('obstacle_avoidance') ? 12 : 6;
  for (let i = 0; i < obstacleCount; i++) {
    const h = 1 + Math.random() * 3;
    const geo = new THREE.BoxGeometry(1, h, 1);
    const mat = new THREE.MeshPhongMaterial({
      color: 0xff4444,
      emissive: 0x330000,
      transparent: true,
      opacity: 0.7,
    });
    const box = new THREE.Mesh(geo, mat);
    const x = (Math.random() - 0.5) * 12;
    const z = -3 - i * 3;
    box.position.set(x, h / 2, z);
    scene.add(box);
    objects.push(box);
  }

  // Collectibles
  if (analysis.mechanics.mechanics.includes('collectibles') || analysis.mechanics.mechanics.includes('coin_collection')) {
    for (let i = 0; i < 15; i++) {
      const geo = new THREE.OctahedronGeometry(0.3);
      const mat = new THREE.MeshPhongMaterial({
        color: 0xffd700,
        emissive: 0x443300,
        transparent: true,
        opacity: 0.9,
      });
      const gem = new THREE.Mesh(geo, mat);
      gem.position.set(
        (Math.random() - 0.5) * 10,
        1 + Math.random() * 2,
        -2 - i * 2.5
      );
      gem.userData = { floats: true, baseY: gem.position.y };
      scene.add(gem);
      objects.push(gem);
    }
  }

  // Environment buildings
  const buildingCount = isCyberpunk ? 20 : 10;
  for (let i = 0; i < buildingCount; i++) {
    const bh = 3 + Math.random() * 8;
    const bw = 1 + Math.random() * 2;
    const geo = new THREE.BoxGeometry(bw, bh, bw);
    const mat = new THREE.MeshPhongMaterial({
      color: isCyberpunk ? 0x1a1a3a : 0x2a2a2a,
      emissive: isCyberpunk ? new THREE.Color(secondaryColor).multiplyScalar(0.05) : 0x111111,
      transparent: true,
      opacity: 0.6,
    });
    const building = new THREE.Mesh(geo, mat);
    const side = i % 2 === 0 ? -1 : 1;
    building.position.set(
      side * (8 + Math.random() * 5),
      bh / 2,
      -i * 3 - 5
    );
    scene.add(building);
    objects.push(building);

    // Neon strips on buildings
    if (isCyberpunk) {
      const stripGeo = new THREE.BoxGeometry(bw + 0.1, 0.1, 0.1);
      const stripMat = new THREE.MeshBasicMaterial({ color: primaryColor });
      const strip = new THREE.Mesh(stripGeo, stripMat);
      strip.position.copy(building.position);
      strip.position.y = bh * 0.7;
      strip.position.x += side * 0.05;
      scene.add(strip);
    }
  }

  // Lane markers for lane-switching games
  if (analysis.movement.laneSwitching) {
    for (let lane = -1; lane <= 1; lane++) {
      for (let i = 0; i < 15; i++) {
        const geo = new THREE.PlaneGeometry(0.3, 1);
        const mat = new THREE.MeshBasicMaterial({
          color: primaryColor,
          transparent: true,
          opacity: 0.3,
          side: THREE.DoubleSide,
        });
        const marker = new THREE.Mesh(geo, mat);
        marker.rotation.x = -Math.PI / 2;
        marker.position.set(lane * 3, 0.05, -i * 3);
        scene.add(marker);
      }
    }
  }

  // Particle-like floating elements
  if (analysis.vfx.particles || analysis.vfx.glow) {
    for (let i = 0; i < 30; i++) {
      const geo = new THREE.SphereGeometry(0.05 + Math.random() * 0.1);
      const mat = new THREE.MeshBasicMaterial({
        color: Math.random() > 0.5 ? primaryColor : secondaryColor,
        transparent: true,
        opacity: 0.6,
      });
      const particle = new THREE.Mesh(geo, mat);
      particle.position.set(
        (Math.random() - 0.5) * 20,
        1 + Math.random() * 8,
        (Math.random() - 0.5) * 30
      );
      particle.userData = { floats: true, baseY: particle.position.y, moves: true, baseX: particle.position.x, moveRange: 1 + Math.random() * 2 };
      scene.add(particle);
      objects.push(particle);
    }
  }
}
