import type { Point } from '../types/board';
import type { ActiveStudyTool, StraightEdgeSegment } from '../types/tools';
import { distancePointToSegment } from './boardGeometry';

export const PX_PER_CM = 38;

export function pxToCm(px: number): number {
  return Math.round((px / PX_PER_CM) * 10) / 10;
}

export function computeRulerEdgeSegment(
  x: number,
  y: number,
  lengthPx: number,
  angleDeg: number
): StraightEdgeSegment {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    a: { x, y },
    b: {
      x: x + lengthPx * Math.cos(rad),
      y: y + lengthPx * Math.sin(rad),
    },
  };
}

export function computeSetSquareVertices(
  x: number,
  y: number,
  legLengthPx: number,
  angleDeg: number
): { rightAngle: Point; legA: Point; legB: Point; edges: StraightEdgeSegment[] } {
  // 30-60-90 drafting triangle with right angle at (x, y)
  const rad = (angleDeg * Math.PI) / 180;
  const legBWidth = legLengthPx;
  const legAHeight = Math.round(legLengthPx * 0.68);

  // Horizontal-ish leg along angleDeg
  const legB: Point = {
    x: x + legBWidth * Math.cos(rad),
    y: y + legBWidth * Math.sin(rad),
  };
  // Perpendicular leg upward (-90 deg from angleDeg)
  const perpRad = rad - Math.PI / 2;
  const legA: Point = {
    x: x + legAHeight * Math.cos(perpRad),
    y: y + legAHeight * Math.sin(perpRad),
  };

  const rightAngle: Point = { x, y };
  return {
    rightAngle,
    legA,
    legB,
    edges: [
      { a: rightAngle, b: legB },
      { a: rightAngle, b: legA },
      { a: legA, b: legB },
    ],
  };
}

export function projectPointOntoSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { ...a };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return {
    x: a.x + t * dx,
    y: a.y + t * dy,
  };
}

/**
 * Snaps a freehand/line chalkboard pointer coordinate onto the closest active
 * ruler or set-square edge if within `snapRadius` pixels.
 */
export function snapPointToStraightedges(
  point: Point,
  tools: ActiveStudyTool[],
  snapRadius = 18
): { point: Point; snapped: boolean } {
  let bestDist = snapRadius;
  let bestPt: Point | null = null;

  for (const tool of tools) {
    if (!tool.enabled) continue;

    let segments: StraightEdgeSegment[] = [];
    if (tool.id === 'ruler') {
      segments = [computeRulerEdgeSegment(tool.x, tool.y, tool.lengthPx, tool.angleDeg)];
    } else if (tool.id === 'set_square') {
      segments = computeSetSquareVertices(tool.x, tool.y, tool.lengthPx, tool.angleDeg).edges;
    }

    for (const seg of segments) {
      const dist = distancePointToSegment(point, seg.a, seg.b);
      if (dist <= bestDist) {
        bestDist = dist;
        bestPt = projectPointOntoSegment(point, seg.a, seg.b);
      }
    }
  }

  return bestPt ? { point: bestPt, snapped: true } : { point, snapped: false };
}

export function computeCompassArcPoints(
  cx: number,
  cy: number,
  radiusPx: number,
  startAngleDeg: number,
  sweepDeg: number,
  steps = 72
): Point[] {
  const safeR = Math.max(16, radiusPx);
  const clampedSweep = Math.max(5, Math.min(360, sweepDeg));
  const segCount = Math.max(8, Math.round((steps * clampedSweep) / 360));
  const pts: Point[] = [];
  for (let i = 0; i <= segCount; i++) {
    const deg = startAngleDeg + (clampedSweep * i) / segCount;
    const rad = (deg * Math.PI) / 180;
    pts.push({
      x: cx + safeR * Math.cos(rad),
      y: cy + safeR * Math.sin(rad),
    });
  }
  return pts;
}

export function computeProtractorRayPoints(
  cx: number,
  cy: number,
  radiusPx: number,
  baseAngleDeg: number,
  measureAngleDeg: number
): { ray0End: Point; rayThetaEnd: Point; polyline: Point[] } {
  const r = Math.max(40, radiusPx);
  const rad0 = (baseAngleDeg * Math.PI) / 180;
  // Counter-clockwise upward angle from baseline (standard math protractor)
  const radTheta = ((baseAngleDeg - measureAngleDeg) * Math.PI) / 180;
  const ray0End: Point = {
    x: cx + r * Math.cos(rad0),
    y: cy + r * Math.sin(rad0),
  };
  const rayThetaEnd: Point = {
    x: cx + r * Math.cos(radTheta),
    y: cy + r * Math.sin(radTheta),
  };
  return {
    ray0End,
    rayThetaEnd,
    polyline: [ray0End, { x: cx, y: cy }, rayThetaEnd],
  };
}

export function computeParabolaPoints(
  vertexX: number,
  vertexY: number,
  angleDeg: number,
  parabolaA: number,
  halfWidthPx: number,
  steps = 48
): Point[] {
  const rad = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  const a = Math.max(-2.5, Math.min(2.5, parabolaA || 0.6));
  const pts: Point[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = -1 + (2 * i) / steps; // -1..1
    const lx = t * halfWidthPx;
    const xCm = lx / PX_PER_CM;
    const yCm = -a * xCm * xCm; // Negative so positive 'a' opens upward in screen coords
    const ly = yCm * PX_PER_CM;

    pts.push({
      x: vertexX + lx * cosA - ly * sinA,
      y: vertexY + lx * sinA + ly * cosA,
    });
  }
  return pts;
}

export function computeSegmentMeasurement(
  a: Point,
  b: Point
): { px: number; cm: number; angleDeg: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const px = Math.hypot(dx, dy);
  const angleDeg = Math.round(((Math.atan2(-dy, dx) * 180) / Math.PI + 360) % 360);
  return {
    px: Math.round(px),
    cm: pxToCm(px),
    angleDeg,
  };
}

export function formatTimerClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
