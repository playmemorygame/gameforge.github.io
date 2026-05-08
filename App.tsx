import { useState, useRef, useCallback, useEffect } from 'react';
import type { GameAnalysisResult, FrameAnalysis, AnalysisTab } from './types';
import { extractFrames, analyzeFrame, analyzeGameplay } from './utils/analyzer';
import ThreePreview from './components/ThreePreview';
import {
  Upload, Film, Cpu, Eye, Zap, Box, Code, FileJson, Sparkles,
  Play, Pause, Download, RotateCcw, Layers, Activity, Crosshair,
  Sun, Palette, Gauge, Clock, ChevronRight, BarChart3, Gamepad2,
  Monitor, Wand2, Globe, Target, TrendingUp
} from 'lucide-react';

type AnalysisPhase = 'idle' | 'extracting' | 'analyzing' | 'complete' | 'error';

export default function App() {
  const [phase, setPhase] = useState<AnalysisPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<GameAnalysisResult | null>(null);
  const [frameAnalyses, setFrameAnalyses] = useState<FrameAnalysis[]>([]);
  const [activeTab, setActiveTab] = useState<AnalysisTab>('overview');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const handleFile = useCallback(async (file: File) => {
    const validTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg'];
    if (!validTypes.some(t => file.type.includes(t.split('/')[1]))) {
      setError('Please upload MP4, MOV, WEBM, or OGG video files');
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      setError('Video must be under 500MB');
      return;
    }

    setError(null);
    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setPhase('idle');
    setAnalysis(null);
    setFrameAnalyses([]);
    setProgress(0);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const startAnalysis = useCallback(async () => {
    if (!videoRef.current || !videoUrl) return;

    const video = videoRef.current;
    setPhase('extracting');
    setProgress(0);
    setProgressLabel('Extracting frames from video...');

    try {
      await new Promise<void>((resolve) => {
        if (video.readyState >= 1) resolve();
        else video.addEventListener('loadedmetadata', () => resolve(), { once: true });
      });

      const duration = video.duration;
      const interval = duration > 30 ? 0.5 : duration > 10 ? 0.2 : 0.1;
      const maxFrames = Math.min(Math.ceil(duration / interval), 300);

      const frames = await extractFrames(video, interval, maxFrames, (pct) => {
        setProgress(pct * 0.6);
      });

      setPhase('analyzing');
      setProgressLabel('Analyzing frames with AI...');

      const analyses: FrameAnalysis[] = [];
      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        const prevFrame = i > 0 ? frames[i - 1] : undefined;
        const result = analyzeFrame(
          frame.canvas,
          frame.timestamp,
          i,
          prevFrame?.canvas
        );
        analyses.push(result);
        setProgress(60 + Math.round((i / frames.length) * 30));
        if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
      }

      setProgressLabel('Generating game analysis...');
      setProgress(92);

      await new Promise(r => setTimeout(r, 200));
      const gameAnalysis = analyzeGameplay(analyses);

      setProgress(100);
      setAnalysis(gameAnalysis);
      setFrameAnalyses(analyses);
      setPhase('complete');
      setActiveTab('overview');
    } catch (err) {
      console.error(err);
      setError('Analysis failed. Please try another video.');
      setPhase('error');
    }
  }, [videoUrl]);

  const resetAnalysis = useCallback(() => {
    setPhase('idle');
    setProgress(0);
    setAnalysis(null);
    setFrameAnalyses([]);
    setSelectedFrame(null);
    setError(null);
  }, []);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) videoRef.current.pause();
    else videoRef.current.play();
  }, [isPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTime = () => setCurrentTime(video.currentTime);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTime);
    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTime);
    };
  }, [videoUrl]);

  const exportJSON = useCallback(() => {
    if (!analysis) return;
    const blob = new Blob([JSON.stringify(analysis.jsonData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `game-analysis-${videoFile?.name || 'video'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [analysis, videoFile]);

  const exportPrompts = useCallback(() => {
    if (!analysis) return;
    const text = Object.entries(analysis.prompts)
      .map(([key, val]) => `## ${key.toUpperCase()}\n\n${val}\n`)
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `game-prompts-${videoFile?.name || 'video'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [analysis, videoFile]);

  const exportReport = useCallback(() => {
    if (!analysis) return;
    const report = `# VIDEO TO GAME ANALYSIS REPORT
==============================================

## SUMMARY
${analysis.summary}

## GAME TYPE
${analysis.gameType}

## CAMERA SYSTEM
- Type: ${analysis.camera.type}
- Movement: ${analysis.camera.movement}
- Shake: ${analysis.camera.shakeDetected ? 'Yes' : 'No'}
- Zoom: ${analysis.camera.zoomDetected ? 'Yes' : 'No'}

## MOVEMENT
- Primary: ${analysis.movement.primaryMotion}
- Speed: ${analysis.movement.speed}%
- Direction: ${analysis.movement.direction}
- Jump: ${analysis.movement.jumpDetected ? 'Yes' : 'No'}
- Slide: ${analysis.movement.slideDetected ? 'Yes' : 'No'}
- Lane Switching: ${analysis.movement.laneSwitching ? 'Yes' : 'No'}

## MECHANICS
${analysis.mechanics.mechanics.map(m => `- ${m} (${Math.round((analysis.mechanics.confidence[m] || 0) * 100)}% confidence)`).join('\n')}

## ENVIRONMENT
- Style: ${analysis.environment.style}
- Setting: ${analysis.environment.setting}
- Time: ${analysis.environment.timeOfDay}
- Lighting: ${analysis.environment.lighting}
- Mood: ${analysis.environment.mood}

## VISUAL EFFECTS
${analysis.vfx.effects.map(e => `- ${e}`).join('\n')}

## DIFFICULTY: ${analysis.difficulty}/100
## ENGAGEMENT PREDICTION: ${analysis.engagementPrediction}/100

## SIMILAR GAMES
${analysis.similarGames.join(', ')}

## TAGS
${analysis.tags.join(', ')}
`;
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `game-report-${videoFile?.name || 'video'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [analysis, videoFile]);

  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !videoRef.current || !frameAnalyses.length) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const time = pct * videoRef.current.duration;
    videoRef.current.currentTime = time;

    const closestFrame = frameAnalyses.reduce((closest, f) =>
      Math.abs(f.timestamp - time) < Math.abs(closest.timestamp - time) ? f : closest
    );
    setSelectedFrame(closestFrame.frameIndex);
  }, [frameAnalyses]);

  const tabs: { id: AnalysisTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <Eye size={16} /> },
    { id: 'mechanics', label: 'Mechanics', icon: <Gamepad2 size={16} /> },
    { id: 'motion', label: 'Motion', icon: <Activity size={16} /> },
    { id: 'environment', label: 'Environment', icon: <Globe size={16} /> },
    { id: 'objects', label: 'Objects', icon: <Crosshair size={16} /> },
    { id: 'animation', label: 'Animation', icon: <Layers size={16} /> },
    { id: 'vfx', label: 'VFX', icon: <Sparkles size={16} /> },
    { id: 'summary', label: 'AI Summary', icon: <Cpu size={16} /> },
    { id: 'prompts', label: 'Prompts', icon: <Wand2 size={16} /> },
    { id: 'json', label: 'JSON', icon: <FileJson size={16} /> },
    { id: '3dpreview', label: '3D Preview', icon: <Box size={16} /> },
  ];

  return (
    <div className="min-h-screen bg-dark-bg bg-grid">
      {/* Header */}
      <header className="glass-panel border-b border-glass-border sticky top-0 z-50 px-6 py-3">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-cyan/20 to-neon-purple/20 border border-neon-cyan/30 flex items-center justify-center">
              <Gamepad2 size={22} className="text-neon-cyan" />
            </div>
            <div>
              <h1 className="text-lg font-bold neon-text text-neon-cyan">VIDEO TO GAME ANALYZER</h1>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest">AI-Powered Gameplay Intelligence</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {analysis && (
              <>
                <button onClick={exportJSON} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-card text-xs text-neon-cyan hover:bg-neon-cyan/10 transition-all">
                  <Download size={14} /> JSON
                </button>
                <button onClick={exportPrompts} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-card text-xs text-neon-purple hover:bg-neon-purple/10 transition-all">
                  <Download size={14} /> Prompts
                </button>
                <button onClick={exportReport} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-card text-xs text-neon-green hover:bg-neon-green/10 transition-all">
                  <Download size={14} /> Report
                </button>
                <button onClick={resetAnalysis} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-card text-xs text-gray-400 hover:text-white transition-all">
                  <RotateCcw size={14} /> New
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-4 md:p-6">
        {/* Upload Section */}
        {!videoUrl && (
          <div className="animate-slide-in flex flex-col items-center justify-center min-h-[70vh]">
            <div className="text-center mb-8">
              <h2 className="text-3xl md:text-4xl font-bold mb-3">
                <span className="text-neon-cyan neon-text">Analyze</span>{' '}
                <span className="text-white">Any Gameplay Video</span>
              </h2>
              <p className="text-gray-400 max-w-xl mx-auto">
                Upload a gameplay video and our AI will detect mechanics, movement, environment,
                camera systems, visual effects, and generate game reconstruction data.
              </p>
            </div>

            <div
              className={`upload-zone rounded-2xl p-12 md:p-16 w-full max-w-2xl text-center cursor-pointer transition-all ${dragOver ? 'drag-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={48} className="mx-auto mb-4 text-neon-cyan/50" />
              <h3 className="text-xl font-semibold mb-2 text-white">Drop your gameplay video here</h3>
              <p className="text-gray-500 text-sm mb-4">or click to browse files</p>
              <div className="flex items-center justify-center gap-3 text-xs text-gray-600">
                <span className="px-2 py-1 rounded bg-dark-card">MP4</span>
                <span className="px-2 py-1 rounded bg-dark-card">MOV</span>
                <span className="px-2 py-1 rounded bg-dark-card">WEBM</span>
                <span className="text-gray-700">|</span>
                <span>Max 500MB</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime,video/ogg"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>

            {error && (
              <div className="mt-4 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-12 max-w-3xl w-full">
              {[
                { icon: <Eye size={20} />, title: 'Frame Analysis', desc: 'Per-frame AI detection' },
                { icon: <Activity size={20} />, title: 'Motion Tracking', desc: 'Movement patterns' },
                { icon: <Cpu size={20} />, title: 'AI Summary', desc: 'Intelligent descriptions' },
                { icon: <Code size={20} />, title: 'Code Generation', desc: 'Prompts & JSON export' },
              ].map((f, i) => (
                <div key={i} className="glass-card p-4 text-center">
                  <div className="text-neon-cyan/60 mb-2 flex justify-center">{f.icon}</div>
                  <h4 className="text-sm font-semibold text-white mb-1">{f.title}</h4>
                  <p className="text-[11px] text-gray-500">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Video + Analysis */}
        {videoUrl && (
          <div className="animate-slide-in grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left: Video Player */}
            <div className="lg:col-span-5 xl:col-span-4 space-y-4">
              {/* Video */}
              <div className="glass-panel neon-glow overflow-hidden">
                <div className="relative bg-black">
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    className="w-full aspect-video object-contain"
                    playsInline
                  />
                  {phase === 'idle' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <button
                        onClick={startAnalysis}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-neon-cyan/20 to-neon-purple/20 border border-neon-cyan/40 text-neon-cyan font-semibold hover:from-neon-cyan/30 hover:to-neon-purple/30 transition-all neon-glow"
                      >
                        <Zap size={20} /> Start AI Analysis
                      </button>
                    </div>
                  )}
                </div>

                {/* Controls */}
                <div className="p-3 flex items-center gap-3">
                  <button onClick={togglePlay} className="text-neon-cyan hover:text-white transition-colors">
                    {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                  </button>
                  <span className="text-xs text-gray-500 font-mono">
                    {formatTime(currentTime)} / {formatTime(videoRef.current?.duration || 0)}
                  </span>
                  <div className="flex-1" />
                  <span className="text-[10px] text-gray-600 truncate max-w-[150px]">{videoFile?.name}</span>
                </div>

                {/* Timeline */}
                {frameAnalyses.length > 0 && (
                  <div
                    ref={timelineRef}
                    className="relative h-12 mx-3 mb-3 rounded-lg bg-dark-card cursor-pointer overflow-hidden"
                    onClick={handleTimelineClick}
                  >
                    {/* Motion heatmap */}
                    {frameAnalyses.map((f, i) => {
                      const pct = (f.timestamp / (videoRef.current?.duration || 1)) * 100;
                      const intensity = f.motion.magnitude;
                      return (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0"
                          style={{
                            left: `${pct}%`,
                            width: `${100 / frameAnalyses.length}%`,
                            background: `rgba(${intensity > 0.3 ? '255,100,50' : intensity > 0.1 ? '0,240,255' : '100,100,150'}, ${0.2 + intensity * 0.6})`,
                          }}
                        />
                      );
                    })}
                    {/* Playhead */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-neon-cyan z-10"
                      style={{ left: `${(currentTime / (videoRef.current?.duration || 1)) * 100}%` }}
                    />
                    {/* Selected frame marker */}
                    {selectedFrame !== null && frameAnalyses[selectedFrame] && (
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-neon-purple z-10"
                        style={{ left: `${(frameAnalyses[selectedFrame].timestamp / (videoRef.current?.duration || 1)) * 100}%` }}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Progress */}
              {(phase === 'extracting' || phase === 'analyzing') && (
                <div className="glass-panel p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-neon-cyan/10 flex items-center justify-center">
                      <Cpu size={16} className="text-neon-cyan animate-pulse-neon" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white">{progressLabel}</p>
                      <p className="text-[11px] text-gray-500">{phase === 'extracting' ? 'FFmpeg Frame Pipeline' : 'Neural Analysis Engine'}</p>
                    </div>
                    <span className="text-sm font-mono text-neon-cyan">{progress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-dark-card overflow-hidden">
                    <div
                      className="h-full metric-bar progress-bar transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Frame Inspector */}
              {selectedFrame !== null && frameAnalyses[selectedFrame] && (
                <FrameInspector frame={frameAnalyses[selectedFrame]} />
              )}

              {/* Quick Stats */}
              {analysis && (
                <div className="glass-panel p-4 space-y-3">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Quick Stats</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <StatCard icon={<Target size={14} />} label="Game Type" value={analysis.gameType.replace(/_/g, ' ')} />
                    <StatCard icon={<Monitor size={14} />} label="Camera" value={analysis.camera.type.replace(/_/g, ' ')} />
                    <StatCard icon={<Gauge size={14} />} label="Difficulty" value={`${analysis.difficulty}/100`} />
                    <StatCard icon={<TrendingUp size={14} />} label="Engagement" value={`${analysis.engagementPrediction}/100`} />
                  </div>
                </div>
              )}
            </div>

            {/* Right: Analysis Panels */}
            <div className="lg:col-span-7 xl:col-span-8 space-y-4">
              {phase === 'complete' && analysis ? (
                <>
                  {/* Tabs */}
                  <div className="glass-panel p-1.5 flex flex-wrap gap-1">
                    {tabs.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                          activeTab === tab.id
                            ? 'tab-active'
                            : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                        }`}
                      >
                        {tab.icon}
                        <span className="hidden sm:inline">{tab.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Tab Content */}
                  <div className="glass-panel p-5 min-h-[500px]">
                    {activeTab === 'overview' && <OverviewPanel analysis={analysis} />}
                    {activeTab === 'mechanics' && <MechanicsPanel analysis={analysis} />}
                    {activeTab === 'motion' && <MotionPanel analysis={analysis} frameAnalyses={frameAnalyses} />}
                    {activeTab === 'environment' && <EnvironmentPanel analysis={analysis} />}
                    {activeTab === 'objects' && <ObjectsPanel analysis={analysis} frameAnalyses={frameAnalyses} />}
                    {activeTab === 'animation' && <AnimationPanel analysis={analysis} />}
                    {activeTab === 'vfx' && <VFXPanel analysis={analysis} />}
                    {activeTab === 'summary' && <SummaryPanel analysis={analysis} />}
                    {activeTab === 'prompts' && <PromptsPanel analysis={analysis} />}
                    {activeTab === 'json' && <JsonPanel analysis={analysis} />}
                    {activeTab === '3dpreview' && <ThreePreview analysis={analysis} />}
                  </div>
                </>
              ) : phase === 'idle' ? (
                <div className="glass-panel p-12 flex flex-col items-center justify-center min-h-[500px] text-center">
                  <Film size={48} className="text-gray-700 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-400 mb-2">Ready to Analyze</h3>
                  <p className="text-sm text-gray-600 max-w-md">
                    Click "Start AI Analysis" on the video player to begin. The system will extract frames,
                    detect objects, analyze motion, and generate comprehensive game intelligence.
                  </p>
                </div>
              ) : (
                <div className="glass-panel p-12 flex flex-col items-center justify-center min-h-[500px]">
                  <div className="w-16 h-16 rounded-full border-2 border-neon-cyan/30 border-t-neon-cyan animate-spin mb-4" />
                  <p className="text-gray-400">{progressLabel}</p>
                  <p className="text-xs text-gray-600 mt-2">{progress}% complete</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ===== SUB-COMPONENTS =====

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="glass-card p-2.5">
      <div className="flex items-center gap-1.5 text-gray-500 mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-sm font-semibold text-white capitalize truncate">{value}</p>
    </div>
  );
}

function FrameInspector({ frame }: { frame: FrameAnalysis }) {
  return (
    <div className="glass-panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-neon-cyan uppercase tracking-wider flex items-center gap-2">
          <Crosshair size={14} /> Frame Inspector
        </h3>
        <span className="text-[10px] text-gray-500 font-mono">@ {frame.timestamp.toFixed(2)}s</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div className="glass-card p-2">
          <span className="text-gray-500">Scene</span>
          <p className="text-white capitalize">{frame.sceneType.replace(/_/g, ' ')}</p>
        </div>
        <div className="glass-card p-2">
          <span className="text-gray-500">Brightness</span>
          <p className="text-white">{Math.round(frame.brightness * 100)}%</p>
        </div>
        <div className="glass-card p-2">
          <span className="text-gray-500">Motion</span>
          <p className="text-white">{Math.round(frame.motion.magnitude * 100)}%</p>
        </div>
        <div className="glass-card p-2">
          <span className="text-gray-500">Edges</span>
          <p className="text-white">{Math.round(frame.edges.edgeDensity * 100)}%</p>
        </div>
        <div className="glass-card p-2">
          <span className="text-gray-500">Objects</span>
          <p className="text-white">{frame.objects.length}</p>
        </div>
        <div className="glass-card p-2">
          <span className="text-gray-500">Contrast</span>
          <p className="text-white">{Math.round(frame.colors.contrast * 100)}%</p>
        </div>
      </div>
      {/* Color palette */}
      <div className="flex gap-1">
        {frame.colors.palette.map((c, i) => (
          <div key={i} className="flex-1 h-4 rounded" style={{ background: c }} title={c} />
        ))}
      </div>
    </div>
  );
}

function OverviewPanel({ analysis }: { analysis: GameAnalysisResult }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
          <Eye className="text-neon-cyan" size={20} /> Analysis Overview
        </h2>
        <p className="text-sm text-gray-400 leading-relaxed">{analysis.summary}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Game Type" value={analysis.gameType.replace(/_/g, ' ')} icon={<Gamepad2 size={16} />} color="cyan" />
        <MetricCard label="Camera" value={analysis.camera.type.replace(/_/g, ' ')} icon={<Monitor size={16} />} color="purple" />
        <MetricCard label="Environment" value={analysis.environment.style} icon={<Globe size={16} />} color="green" />
        <MetricCard label="Movement" value={analysis.movement.primaryMotion.replace(/_/g, ' ')} icon={<Activity size={16} />} color="pink" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-card p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <BarChart3 size={14} /> Scores
          </h3>
          <div className="space-y-3">
            <ScoreBar label="Difficulty" value={analysis.difficulty} color="from-neon-orange to-red-500" />
            <ScoreBar label="Engagement" value={analysis.engagementPrediction} color="from-neon-cyan to-neon-purple" />
            <ScoreBar label="Animation Smoothness" value={Math.round(analysis.animation.smoothness * 100)} color="from-neon-green to-neon-cyan" />
            <ScoreBar label="Motion Intensity" value={analysis.pacing.intensity} color="from-neon-purple to-neon-pink" />
            <ScoreBar label="Visual Complexity" value={Math.round(analysis.frameAnalyses.reduce((s, f) => s + f.edges.complexity, 0) / analysis.frameAnalyses.length * 100)} color="from-yellow-400 to-neon-orange" />
          </div>
        </div>

        <div className="glass-card p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Layers size={14} /> Detected Features
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {analysis.tags.map((tag, i) => (
              <span key={i} className="px-2 py-1 rounded-md text-[11px] bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20">
                {tag}
              </span>
            ))}
          </div>
          <div className="mt-4">
            <h4 className="text-[11px] text-gray-500 uppercase mb-2">Similar Games</h4>
            <div className="flex flex-wrap gap-1.5">
              {analysis.similarGames.map((game, i) => (
                <span key={i} className="px-2 py-1 rounded-md text-[11px] bg-neon-purple/10 text-neon-purple border border-neon-purple/20">
                  {game}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card p-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Clock size={14} /> Pacing Analysis
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-neon-cyan">{analysis.pacing.tempo}</p>
            <p className="text-[10px] text-gray-500 uppercase">Tempo</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-neon-purple">{analysis.pacing.intensity}%</p>
            <p className="text-[10px] text-gray-500 uppercase">Intensity</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-neon-green">{analysis.pacing.variation}%</p>
            <p className="text-[10px] text-gray-500 uppercase">Variation</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  const colorMap: Record<string, string> = {
    cyan: 'text-neon-cyan border-neon-cyan/20 bg-neon-cyan/5',
    purple: 'text-neon-purple border-neon-purple/20 bg-neon-purple/5',
    green: 'text-neon-green border-neon-green/20 bg-neon-green/5',
    pink: 'text-neon-pink border-neon-pink/20 bg-neon-pink/5',
  };
  return (
    <div className={`rounded-xl p-3 border ${colorMap[color]}`}>
      <div className="flex items-center gap-1.5 mb-1 opacity-60">{icon}<span className="text-[10px] uppercase tracking-wider">{label}</span></div>
      <p className="text-sm font-bold capitalize">{value}</p>
    </div>
  );
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-white font-mono">{value}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-dark-card overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-1000`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function MechanicsPanel({ analysis }: { analysis: GameAnalysisResult }) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white flex items-center gap-2">
        <Gamepad2 className="text-neon-cyan" size={20} /> Game Mechanics
      </h2>

      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold text-neon-cyan mb-3">Game Type: {analysis.mechanics.gameType.replace(/_/g, ' ')}</h3>
        <div className="space-y-3">
          {analysis.mechanics.mechanics.map((mech) => (
            <div key={mech} className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-neon-cyan" />
              <span className="text-sm text-white capitalize flex-1">{mech.replace(/_/g, ' ')}</span>
              <div className="w-24 h-1.5 rounded-full bg-dark-card overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-neon-cyan to-neon-purple"
                  style={{ width: `${(analysis.mechanics.confidence[mech] || 0) * 100}%` }}
                />
              </div>
              <span className="text-[11px] text-gray-500 font-mono w-10 text-right">
                {Math.round((analysis.mechanics.confidence[mech] || 0) * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-card p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Movement System</h3>
          <div className="space-y-2 text-sm">
            <InfoRow label="Primary Motion" value={analysis.movement.primaryMotion.replace(/_/g, ' ')} />
            <InfoRow label="Speed" value={`${analysis.movement.speed}%`} />
            <InfoRow label="Direction" value={analysis.movement.direction} />
            <InfoRow label="Running" value={analysis.movement.running ? '✓ Yes' : '✗ No'} />
            <InfoRow label="Jump" value={analysis.movement.jumpDetected ? '✓ Detected' : '✗ Not detected'} />
            <InfoRow label="Slide" value={analysis.movement.slideDetected ? '✓ Detected' : '✗ Not detected'} />
            <InfoRow label="Lane Switching" value={analysis.movement.laneSwitching ? '✓ Detected' : '✗ Not detected'} />
          </div>
        </div>

        <div className="glass-card p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Camera System</h3>
          <div className="space-y-2 text-sm">
            <InfoRow label="Type" value={analysis.camera.type.replace(/_/g, ' ')} />
            <InfoRow label="Movement" value={analysis.camera.movement.replace(/_/g, ' ')} />
            <InfoRow label="Follow Cam" value={analysis.camera.followCam ? '✓ Yes' : '✗ No'} />
            <InfoRow label="Camera Shake" value={analysis.camera.shakeDetected ? '✓ Detected' : '✗ Not detected'} />
            <InfoRow label="Zoom" value={analysis.camera.zoomDetected ? '✓ Detected' : '✗ Not detected'} />
            <InfoRow label="Confidence" value={`${Math.round(analysis.camera.confidence * 100)}%`} />
          </div>
        </div>
      </div>

      <div className="glass-card p-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">UI Elements</h3>
        <div className="flex flex-wrap gap-2">
          {analysis.ui.elements.length > 0 ? analysis.ui.elements.map((el, i) => (
            <span key={i} className="px-3 py-1.5 rounded-lg text-xs bg-neon-purple/10 text-neon-purple border border-neon-purple/20">
              {el.replace(/_/g, ' ')}
            </span>
          )) : <span className="text-sm text-gray-500">No UI elements detected</span>}
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <InfoRow label="HUD" value={analysis.ui.hasHUD ? '✓' : '✗'} />
          <InfoRow label="Score" value={analysis.ui.hasScore ? '✓' : '✗'} />
          <InfoRow label="Buttons" value={analysis.ui.hasButtons ? '✓' : '✗'} />
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-500 text-xs">{label}</span>
      <span className="text-white text-xs font-medium capitalize">{value}</span>
    </div>
  );
}

function MotionPanel({ analysis, frameAnalyses }: { analysis: GameAnalysisResult; frameAnalyses: FrameAnalysis[] }) {
  const motionData = frameAnalyses.map(f => f.motion.magnitude);
  const maxMotion = Math.max(...motionData, 0.01);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white flex items-center gap-2">
        <Activity className="text-neon-cyan" size={20} /> Motion Analysis
      </h2>

      {/* Motion Graph */}
      <div className="glass-card p-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Motion Intensity Over Time</h3>
        <div className="relative h-40 flex items-end gap-px">
          {motionData.map((m, i) => (
            <div
              key={i}
              className="flex-1 rounded-t transition-all"
              style={{
                height: `${(m / maxMotion) * 100}%`,
                background: `linear-gradient(to top, rgba(0,240,255,0.3), rgba(168,85,247,${0.3 + m * 0.7}))`,
                minWidth: '2px',
              }}
              title={`Frame ${i}: ${Math.round(m * 100)}% motion`}
            />
          ))}
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-gray-600">
          <span>0s</span>
          <span>{frameAnalyses.length > 0 ? frameAnalyses[Math.floor(frameAnalyses.length / 2)].timestamp.toFixed(1) + 's' : ''}</span>
          <span>{frameAnalyses.length > 0 ? frameAnalyses[frameAnalyses.length - 1].timestamp.toFixed(1) + 's' : ''}</span>
        </div>
      </div>

      {/* Motion Direction */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-card p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Movement Profile</h3>
          <div className="space-y-3">
            <ScoreBar label="Overall Speed" value={analysis.movement.speed} color="from-neon-cyan to-blue-500" />
            <ScoreBar label="Motion Consistency" value={Math.round(analysis.animation.motionConsistency * 100)} color="from-neon-green to-neon-cyan" />
            <ScoreBar label="Avg Motion Magnitude" value={Math.round(frameAnalyses.reduce((s, f) => s + f.motion.magnitude, 0) / frameAnalyses.length * 100)} color="from-neon-purple to-neon-pink" />
          </div>
        </div>

        <div className="glass-card p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Motion Regions</h3>
          <div className="relative w-full aspect-video bg-dark-card rounded-lg overflow-hidden">
            {/* Aggregate motion heatmap */}
            {frameAnalyses.slice(0, 30).flatMap(f =>
              f.motion.regions.map((r, ri) => (
                <div
                  key={`${f.frameIndex}-${ri}`}
                  className="absolute rounded"
                  style={{
                    left: `${r.x / 640 * 100}%`,
                    top: `${r.y / 360 * 100}%`,
                    width: `${r.w / 640 * 100}%`,
                    height: `${r.h / 360 * 100}%`,
                    background: `rgba(0, 240, 255, ${r.intensity * 0.3})`,
                    border: `1px solid rgba(0, 240, 255, ${r.intensity * 0.5})`,
                  }}
                />
              ))
            )}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] text-gray-600">Motion Heatmap</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EnvironmentPanel({ analysis }: { analysis: GameAnalysisResult }) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white flex items-center gap-2">
        <Globe className="text-neon-cyan" size={20} /> Environment Analysis
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Style" value={analysis.environment.style} icon={<Palette size={16} />} color="cyan" />
        <MetricCard label="Time" value={analysis.environment.timeOfDay} icon={<Sun size={16} />} color="purple" />
        <MetricCard label="Lighting" value={analysis.environment.lighting} icon={<Zap size={16} />} color="green" />
        <MetricCard label="Mood" value={analysis.environment.mood.split(' ')[0]} icon={<Sparkles size={16} />} color="pink" />
      </div>

      <div className="glass-card p-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Color Palette</h3>
        <div className="flex gap-2 mb-3">
          {analysis.environment.palette.map((color, i) => (
            <div key={i} className="flex-1 space-y-1">
              <div className="h-16 rounded-lg border border-white/10" style={{ background: color }} />
              <p className="text-[9px] text-gray-500 text-center font-mono truncate">{color}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-card p-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Environment Details</h3>
        <div className="space-y-2 text-sm">
          <InfoRow label="Setting" value={analysis.environment.setting} />
          <InfoRow label="Style" value={analysis.environment.style} />
          <InfoRow label="Time of Day" value={analysis.environment.timeOfDay} />
          <InfoRow label="Lighting" value={analysis.environment.lighting} />
          <InfoRow label="Mood" value={analysis.environment.mood} />
        </div>
      </div>

      {/* Scene type breakdown */}
      <div className="glass-card p-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Scene Classification</h3>
        <div className="space-y-2">
          {Object.entries(
            analysis.frameAnalyses.reduce((acc, f) => {
              acc[f.sceneType] = (acc[f.sceneType] || 0) + 1;
              return acc;
            }, {} as Record<string, number>)
          )
            .sort((a, b) => b[1] - a[1])
            .map(([scene, count]) => (
              <div key={scene} className="flex items-center gap-3">
                <span className="text-xs text-white capitalize flex-1">{scene.replace(/_/g, ' ')}</span>
                <div className="w-32 h-1.5 rounded-full bg-dark-card overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-neon-cyan to-neon-purple"
                    style={{ width: `${(count / analysis.frameAnalyses.length) * 100}%` }}
                  />
                </div>
                <span className="text-[11px] text-gray-500 font-mono w-10 text-right">
                  {Math.round((count / analysis.frameAnalyses.length) * 100)}%
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function ObjectsPanel({ analysis, frameAnalyses }: { analysis: GameAnalysisResult; frameAnalyses: FrameAnalysis[] }) {
  const objectCounts = analysis.objects.reduce((acc, o) => {
    acc[o.label] = (acc[o.label] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const sortedObjects = Object.entries(objectCounts).sort((a, b) => b[1] - a[1]);

  // Show detection for a specific frame
  const displayFrame = frameAnalyses[Math.floor(frameAnalyses.length / 2)];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white flex items-center gap-2">
        <Crosshair className="text-neon-cyan" size={20} /> Object Detection
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-card p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Detected Object Types</h3>
          <div className="space-y-2">
            {sortedObjects.map(([label, count]) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded" style={{ background: analysis.objects.find(o => o.label === label)?.color || '#666' }} />
                <span className="text-sm text-white capitalize flex-1">{label.replace(/_/g, ' ')}</span>
                <span className="text-xs text-gray-500 font-mono">{count} detections</span>
              </div>
            ))}
            {sortedObjects.length === 0 && <p className="text-sm text-gray-500">No objects detected</p>}
          </div>
        </div>

        <div className="glass-card p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Detection Visualization</h3>
          <div className="relative w-full aspect-video bg-dark-card rounded-lg overflow-hidden">
            {displayFrame && displayFrame.objects.map((obj, i) => (
              <div
                key={i}
                className="absolute border-2 rounded"
                style={{
                  left: `${obj.bbox.x * 100}%`,
                  top: `${obj.bbox.y * 100}%`,
                  width: `${obj.bbox.w * 100}%`,
                  height: `${obj.bbox.h * 100}%`,
                  borderColor: obj.color,
                  boxShadow: `0 0 8px ${obj.color}40`,
                }}
              >
                <span className="absolute -top-4 left-0 text-[8px] px-1 rounded" style={{ background: obj.color, color: '#000' }}>
                  {obj.label.replace(/_/g, ' ')}
                </span>
              </div>
            ))}
            <div className="absolute bottom-1 right-1 text-[9px] text-gray-600">
              Frame @ {displayFrame?.timestamp.toFixed(2)}s
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card p-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Detection Statistics</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-neon-cyan">{analysis.objects.length}</p>
            <p className="text-[10px] text-gray-500 uppercase">Total Detections</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-neon-purple">{sortedObjects.length}</p>
            <p className="text-[10px] text-gray-500 uppercase">Unique Types</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-neon-green">
              {analysis.objects.length > 0 ? (analysis.objects.reduce((s, o) => s + o.confidence, 0) / analysis.objects.length * 100).toFixed(0) : 0}%
            </p>
            <p className="text-[10px] text-gray-500 uppercase">Avg Confidence</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AnimationPanel({ analysis }: { analysis: GameAnalysisResult }) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white flex items-center gap-2">
        <Layers className="text-neon-cyan" size={20} /> Animation Analysis
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Smoothness" value={`${Math.round(analysis.animation.smoothness * 100)}%`} icon={<Activity size={16} />} color="cyan" />
        <MetricCard label="Frame Rate" value={`${analysis.animation.frameRate} fps`} icon={<Clock size={16} />} color="purple" />
        <MetricCard label="Consistency" value={`${Math.round(analysis.animation.motionConsistency * 100)}%`} icon={<BarChart3 size={16} />} color="green" />
        <MetricCard label="Type" value={analysis.animation.animationType.replace(/_/g, ' ')} icon={<Layers size={16} />} color="pink" />
      </div>

      <div className="glass-card p-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Animation Quality Metrics</h3>
        <div className="space-y-3">
          <ScoreBar label="Motion Smoothness" value={Math.round(analysis.animation.smoothness * 100)} color="from-neon-cyan to-blue-500" />
          <ScoreBar label="Frame Consistency" value={Math.round(analysis.animation.motionConsistency * 100)} color="from-neon-green to-neon-cyan" />
          <ScoreBar label="Pacing Intensity" value={analysis.pacing.intensity} color="from-neon-purple to-neon-pink" />
          <ScoreBar label="Pacing Variation" value={analysis.pacing.variation} color="from-yellow-400 to-neon-orange" />
        </div>
      </div>

      <div className="glass-card p-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Motion Direction Analysis</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <p className="text-lg font-bold text-neon-cyan capitalize">{analysis.movement.direction}</p>
            <p className="text-[10px] text-gray-500 uppercase">Primary Direction</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-neon-purple capitalize">{analysis.movement.primaryMotion.replace(/_/g, ' ')}</p>
            <p className="text-[10px] text-gray-500 uppercase">Motion Type</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function VFXPanel({ analysis }: { analysis: GameAnalysisResult }) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white flex items-center gap-2">
        <Sparkles className="text-neon-cyan" size={20} /> Visual Effects Analysis
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: 'Glow Effects', detected: analysis.vfx.glow },
          { label: 'Particles', detected: analysis.vfx.particles },
          { label: 'Motion Blur', detected: analysis.vfx.motionBlur },
          { label: 'Bloom', detected: analysis.vfx.bloom },
          { label: 'Dynamic Shadows', detected: analysis.vfx.shadows },
          { label: 'Post Processing', detected: analysis.vfx.postProcessing },
        ].map((vfx) => (
          <div key={vfx.label} className={`glass-card p-4 text-center border ${vfx.detected ? 'border-neon-cyan/30' : 'border-gray-800'}`}>
            <div className={`text-2xl mb-1 ${vfx.detected ? 'text-neon-cyan' : 'text-gray-700'}`}>
              {vfx.detected ? '✓' : '✗'}
            </div>
            <p className={`text-sm ${vfx.detected ? 'text-white' : 'text-gray-600'}`}>{vfx.label}</p>
            <p className="text-[10px] text-gray-500">{vfx.detected ? 'Detected' : 'Not detected'}</p>
          </div>
        ))}
      </div>

      <div className="glass-card p-4">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Active Effects</h3>
        <div className="flex flex-wrap gap-2">
          {analysis.vfx.effects.map((effect, i) => (
            <span key={i} className="px-3 py-1.5 rounded-lg text-xs bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20 capitalize">
              {effect.replace(/_/g, ' ')}
            </span>
          ))}
          {analysis.vfx.effects.length === 0 && (
            <span className="text-sm text-gray-500">No significant visual effects detected</span>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryPanel({ analysis }: { analysis: GameAnalysisResult }) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white flex items-center gap-2">
        <Cpu className="text-neon-cyan" size={20} /> AI Summary
      </h2>

      <div className="glass-card p-5 border-l-2 border-neon-cyan">
        <p className="text-sm text-gray-300 leading-relaxed">{analysis.summary}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-card p-4">
          <h3 className="text-xs font-semibold text-neon-cyan uppercase tracking-wider mb-3">Game Description</h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            A {analysis.mechanics.gameType.replace(/_/g, ' ')} game set in a {analysis.environment.style.toLowerCase()} environment.
            The gameplay features {analysis.movement.primaryMotion.replace(/_/g, ' ')} movement
            {analysis.movement.jumpDetected ? ', jumping mechanics' : ''}
            {analysis.movement.laneSwitching ? ', lane switching' : ''}
            {analysis.mechanics.mechanics.includes('collectibles') ? ', and collectible items' : ''}.
            The {analysis.camera.type.replace(/_/g, ' ')} camera provides a {analysis.camera.movement.replace(/_/g, ' ')} view of the action.
          </p>
        </div>

        <div className="glass-card p-4">
          <h3 className="text-xs font-semibold text-neon-purple uppercase tracking-wider mb-3">Engagement Analysis</h3>
          <div className="space-y-3">
            <ScoreBar label="Predicted Engagement" value={analysis.engagementPrediction} color="from-neon-cyan to-neon-purple" />
            <ScoreBar label="Difficulty Level" value={analysis.difficulty} color="from-neon-orange to-red-500" />
            <p className="text-[11px] text-gray-500 mt-2">
              {analysis.engagementPrediction > 70 ? 'High engagement potential - strong visual feedback and active gameplay.' :
               analysis.engagementPrediction > 40 ? 'Moderate engagement - good balance of action and pacing.' :
               'Lower engagement - may benefit from more dynamic elements.'}
            </p>
          </div>
        </div>
      </div>

      <div className="glass-card p-4">
        <h3 className="text-xs font-semibold text-neon-green uppercase tracking-wider mb-3">Key Insights</h3>
        <ul className="space-y-2 text-sm text-gray-400">
          <li className="flex items-start gap-2"><ChevronRight size={14} className="text-neon-green mt-0.5 shrink-0" /> {analysis.mechanics.mechanics.length} gameplay mechanics detected with {Object.keys(analysis.mechanics.confidence).length} confidence metrics</li>
          <li className="flex items-start gap-2"><ChevronRight size={14} className="text-neon-green mt-0.5 shrink-0" /> {analysis.vfx.effects.length} visual effects identified across {analysis.frameAnalyses.length} analyzed frames</li>
          <li className="flex items-start gap-2"><ChevronRight size={14} className="text-neon-green mt-0.5 shrink-0" /> Environment classified as {analysis.environment.style} with {analysis.environment.lighting} lighting</li>
          <li className="flex items-start gap-2"><ChevronRight size={14} className="text-neon-green mt-0.5 shrink-0" /> Animation quality: {analysis.animation.animationType.replace(/_/g, ' ')} ({Math.round(analysis.animation.smoothness * 100)}% smoothness)</li>
          <li className="flex items-start gap-2"><ChevronRight size={14} className="text-neon-green mt-0.5 shrink-0" /> Similar games: {analysis.similarGames.join(', ')}</li>
        </ul>
      </div>
    </div>
  );
}

function PromptsPanel({ analysis }: { analysis: GameAnalysisResult }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const promptEntries = Object.entries(analysis.prompts);
  const labelMap: Record<string, { label: string; color: string }> = {
    claude: { label: 'Claude', color: 'neon-orange' },
    chatgpt: { label: 'ChatGPT', color: 'neon-green' },
    gameEngine: { label: 'Game Engine', color: 'neon-cyan' },
    imageGen: { label: 'Image Generation', color: 'neon-purple' },
    arenaAI: { label: 'Arena.ai', color: 'neon-pink' },
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white flex items-center gap-2">
        <Wand2 className="text-neon-cyan" size={20} /> AI Prompts
      </h2>
      <p className="text-sm text-gray-500">Generated prompts based on the video analysis. Copy and use with your preferred AI tool.</p>

      {promptEntries.map(([key, prompt]) => {
        const info = labelMap[key] || { label: key, color: 'neon-cyan' };
        return (
          <div key={key} className="glass-card p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className={`text-xs font-semibold uppercase tracking-wider text-${info.color}`}>{info.label}</h3>
              <button
                onClick={() => copyToClipboard(prompt, key)}
                className="text-[11px] px-2 py-1 rounded glass-card text-gray-400 hover:text-white transition-colors"
              >
                {copiedKey === key ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <pre className="text-xs text-gray-400 whitespace-pre-wrap font-mono leading-relaxed">{prompt}</pre>
          </div>
        );
      })}
    </div>
  );
}

function JsonPanel({ analysis }: { analysis: GameAnalysisResult }) {
  const [copied, setCopied] = useState(false);

  const copyJSON = () => {
    navigator.clipboard.writeText(JSON.stringify(analysis.jsonData, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <FileJson className="text-neon-cyan" size={20} /> JSON Data
        </h2>
        <button
          onClick={copyJSON}
          className="text-xs px-3 py-1.5 rounded-lg glass-card text-gray-400 hover:text-white transition-colors"
        >
          {copied ? '✓ Copied' : 'Copy JSON'}
        </button>
      </div>

      <div className="glass-card p-4 overflow-auto max-h-[600px]">
        <pre className="text-xs text-gray-400 font-mono leading-relaxed">
          {JSON.stringify(analysis.jsonData, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
