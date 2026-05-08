export interface FrameData {
  index: number;
  timestamp: number;
  imageData: ImageData;
  canvas: HTMLCanvasElement;
}

export interface ColorInfo {
  dominant: string;
  palette: string[];
  avgBrightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
}

export interface MotionData {
  magnitude: number;
  direction: { x: number; y: number };
  regions: { x: number; y: number; w: number; h: number; intensity: number }[];
}

export interface DetectedObject {
  label: string;
  confidence: number;
  bbox: { x: number; y: number; w: number; h: number };
  color: string;
  timestamp: number;
}

export interface EdgeData {
  edgeDensity: number;
  horizontalEdges: number;
  verticalEdges: number;
  complexity: number;
}

export interface FrameAnalysis {
  timestamp: number;
  frameIndex: number;
  colors: ColorInfo;
  motion: MotionData;
  edges: EdgeData;
  objects: DetectedObject[];
  brightness: number;
  sceneType: string;
}

export interface CameraAnalysis {
  type: string;
  movement: string;
  shakeDetected: boolean;
  zoomDetected: boolean;
  followCam: boolean;
  confidence: number;
}

export interface MovementAnalysis {
  primaryMotion: string;
  speed: number;
  direction: string;
  jumpDetected: boolean;
  slideDetected: boolean;
  laneSwitching: boolean;
  running: boolean;
}

export interface MechanicsAnalysis {
  gameType: string;
  mechanics: string[];
  confidence: Record<string, number>;
}

export interface EnvironmentAnalysis {
  style: string;
  setting: string;
  timeOfDay: string;
  lighting: string;
  palette: string[];
  mood: string;
}

export interface VFXAnalysis {
  particles: boolean;
  glow: boolean;
  motionBlur: boolean;
  bloom: boolean;
  shadows: boolean;
  postProcessing: boolean;
  effects: string[];
}

export interface UIAnalysis {
  hasHUD: boolean;
  hasScore: boolean;
  hasMinimap: boolean;
  hasButtons: boolean;
  hasHealthBar: boolean;
  elements: string[];
}

export interface AnimationAnalysis {
  smoothness: number;
  frameRate: number;
  motionConsistency: number;
  animationType: string;
}

export interface PacingAnalysis {
  intensity: number;
  variation: number;
  tempo: string;
  engagementScore: number;
}

export interface GameAnalysisResult {
  gameType: string;
  camera: CameraAnalysis;
  movement: MovementAnalysis;
  mechanics: MechanicsAnalysis;
  environment: EnvironmentAnalysis;
  vfx: VFXAnalysis;
  ui: UIAnalysis;
  animation: AnimationAnalysis;
  pacing: PacingAnalysis;
  objects: DetectedObject[];
  frameAnalyses: FrameAnalysis[];
  summary: string;
  tags: string[];
  jsonData: Record<string, unknown>;
  prompts: Record<string, string>;
  difficulty: number;
  engagementPrediction: number;
  similarGames: string[];
}

export type AnalysisTab =
  | 'overview'
  | 'mechanics'
  | 'motion'
  | 'environment'
  | 'objects'
  | 'animation'
  | 'vfx'
  | 'summary'
  | 'prompts'
  | 'json'
  | '3dpreview';
