import type { Point } from './board';

export type StudyToolKind =
  | 'ruler'
  | 'compass'
  | 'protractor'
  | 'set_square'
  | 'measure_tape'
  | 'parabola_ruler'
  | 'magnifier'
  | 'timer';

export interface ActiveStudyTool {
  id: StudyToolKind;
  enabled: boolean;
  x: number;
  y: number;
  angleDeg: number;
  // Ruler / Set Square / Protractor / Parabola sizing
  lengthPx: number;
  // Compass
  radiusPx: number;
  sweepDeg: number;
  // Protractor measured angle (0..180)
  measureAngleDeg: number;
  // Measure tape second endpoint
  endX: number;
  endY: number;
  // Parabola curvature coefficient (y = a * x^2 in cm space)
  parabolaA: number;
  // Magnifier zoom factor
  zoom: number;
  // Timer state
  timerMode: 'stopwatch' | 'countdown';
  timerSeconds: number;
  timerDurationSec: number;
  timerRunning: boolean;
}

export interface StraightEdgeSegment {
  a: Point;
  b: Point;
}

export interface StudyToolCatalogItem {
  id: StudyToolKind;
  name: string;
  shortDesc: string;
}
