import test from 'node:test';
import assert from 'node:assert/strict';
import type { ActiveStudyTool } from '../types/tools';
import {
  computeCompassArcPoints,
  computeParabolaPoints,
  computeProtractorRayPoints,
  computeSegmentMeasurement,
  computeSetSquareVertices,
  formatTimerClock,
  PX_PER_CM,
  snapPointToStraightedges,
} from './studyToolsGeometry';

function makeBaseTool(partial: Partial<ActiveStudyTool> & { id: ActiveStudyTool['id'] }): ActiveStudyTool {
  return {
    enabled: true,
    x: 100,
    y: 200,
    angleDeg: 0,
    lengthPx: 300,
    radiusPx: 95,
    sweepDeg: 360,
    measureAngleDeg: 60,
    endX: 300,
    endY: 200,
    parabolaA: 0.5,
    zoom: 2.2,
    timerMode: 'countdown',
    timerSeconds: 180,
    timerDurationSec: 180,
    timerRunning: false,
    ...partial,
  };
}

test('snapPointToStraightedges snaps nearby points onto ruler and set square edges', () => {
  const ruler = makeBaseTool({ id: 'ruler', x: 100, y: 200, lengthPx: 300, angleDeg: 0 });
  const near = snapPointToStraightedges({ x: 220, y: 210 }, [ruler], 18);
  assert.equal(near.snapped, true);
  assert.equal(Math.round(near.point.x), 220);
  assert.equal(Math.round(near.point.y), 200);

  const far = snapPointToStraightedges({ x: 220, y: 260 }, [ruler], 18);
  assert.equal(far.snapped, false);
  assert.deepEqual(far.point, { x: 220, y: 260 });

  const setSquare = makeBaseTool({ id: 'set_square', x: 400, y: 400, lengthPx: 200, angleDeg: 0 });
  const verts = computeSetSquareVertices(400, 400, 200, 0);
  assert.equal(verts.edges.length, 3);
  // Point near vertical right-angle leg x=400, y=340
  const nearLeg = snapPointToStraightedges({ x: 408, y: 340 }, [setSquare], 18);
  assert.equal(nearLeg.snapped, true);
  assert.equal(Math.round(nearLeg.point.x), 400);
  assert.equal(Math.round(nearLeg.point.y), 340);
});

test('computeCompassArcPoints generates accurate circle points at given radius', () => {
  const pts = computeCompassArcPoints(300, 300, 100, 0, 360, 36);
  assert.equal(pts.length, 37);
  for (const pt of pts) {
    const d = Math.hypot(pt.x - 300, pt.y - 300);
    assert.ok(Math.abs(d - 100) < 0.01);
  }
});

test('computeProtractorRayPoints builds accurate 90-degree angle polyline', () => {
  const res = computeProtractorRayPoints(200, 300, 120, 0, 90);
  assert.ok(Math.abs(res.ray0End.x - 320) < 0.01);
  assert.ok(Math.abs(res.ray0End.y - 300) < 0.01);
  assert.ok(Math.abs(res.rayThetaEnd.x - 200) < 0.01);
  assert.ok(Math.abs(res.rayThetaEnd.y - 180) < 0.01);
  assert.equal(res.polyline.length, 3);
});

test('computeParabolaPoints passes through vertex at midpoint', () => {
  const pts = computeParabolaPoints(400, 500, 0, 0.5, 114, 20);
  assert.equal(pts.length, 21);
  assert.ok(Math.abs(pts[10].x - 400) < 0.01);
  assert.ok(Math.abs(pts[10].y - 500) < 0.01);
  // Symmetric endpoints open upward
  assert.ok(pts[0].y < 500 && Math.abs(pts[0].y - pts[20].y) < 0.01);
});

test('computeSegmentMeasurement and formatTimerClock calculate cm and MM:SS', () => {
  const m = computeSegmentMeasurement({ x: 0, y: 0 }, { x: PX_PER_CM * 3, y: PX_PER_CM * 4 });
  assert.equal(m.cm, 5);
  assert.equal(formatTimerClock(185), '03:05');
  assert.equal(formatTimerClock(-5), '00:00');
});
