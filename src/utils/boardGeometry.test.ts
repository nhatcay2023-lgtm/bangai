import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampBoardItemBox,
  clampPosition,
  computePinchItemBox,
  computePopoverPosition,
  computeRadialRingPositions,
  computeTriangleVertices,
  evaluateMathExpression,
  hitTestStroke,
  sampleFunctionPoints,
  simplifyPoints,
} from './boardGeometry';
import type { Stroke } from '../types/board';

test('clampPosition keeps floating bubbles inside viewport bounds', () => {
  const topLeft = clampPosition(-50, -20, 200, 100, 1440, 900, 12);
  assert.deepEqual(topLeft, { x: 12, y: 12 });

  const bottomRight = clampPosition(2000, 1500, 200, 100, 1440, 900, 12);
  assert.deepEqual(bottomRight, { x: 1228, y: 788 });
});

test('clampBoardItemBox enforces min/max dimensions and keeps item inside chalkboard', () => {
  const shrunk = clampBoardItemBox({ x: -30, y: -10, width: 60, height: 50 }, 1200, 800);
  assert.deepEqual(shrunk, { x: 8, y: 8, width: 140, height: 110 });

  const enlarged = clampBoardItemBox({ x: 900, y: 500, width: 1200, height: 1000 }, 1200, 800);
  assert.equal(enlarged.width, 800);
  assert.equal(enlarged.height, 700);
  assert.equal(enlarged.x, 392);
  assert.equal(enlarged.y, 92);
});

test('computePinchItemBox scales proportionally around pinch midpoint and supports panning', () => {
  const orig = { x: 200, y: 200, width: 200, height: 160 };
  // Spread two fingers from distance 100 to distance 200 centered at (300, 280) -> 2x zoom
  const zoomedIn = computePinchItemBox(
    orig,
    { x: 250, y: 280 },
    { x: 350, y: 280 },
    { x: 200, y: 280 },
    { x: 400, y: 280 },
    1440,
    900
  );
  assert.equal(zoomedIn.width, 400);
  assert.equal(zoomedIn.height, 320);
  assert.equal(zoomedIn.x, 100);
  assert.equal(zoomedIn.y, 120);

  // Pinch inward to 0.5x -> clamped to minimum size 140x110 (scale = 140/200 = 0.7)
  const zoomedOut = computePinchItemBox(
    orig,
    { x: 200, y: 280 },
    { x: 400, y: 280 },
    { x: 275, y: 280 },
    { x: 325, y: 280 },
    1440,
    900
  );
  assert.equal(zoomedOut.width, 140);
  assert.equal(zoomedOut.height, 112);
});

test('computeRadialRingPositions arranges 6 items evenly around safe hub center', () => {
  // Near top-left corner: hub center should nudge inward so all radial items stay onscreen
  const layout = computeRadialRingPositions(30, 70, 6, 86, 28, 1440, 900);
  assert.equal(layout.items.length, 6);
  assert.ok(layout.hubCenter.x >= 86 + 28 + 14);
  assert.ok(layout.hubCenter.y >= 68 + 86 + 28);
  for (const pt of layout.items) {
    assert.ok(pt.x >= 28 && pt.x <= 1440 - 28);
    assert.ok(pt.y >= 68 && pt.y <= 900 - 28);
  }
});

test('computePopoverPosition picks opposite side when hub is near right edge', () => {
  const posRightHub = computePopoverPosition(1280, 450, 118, 340, 420, 1440, 900);
  assert.ok(posRightHub.x + 340 <= 1280 - 118);

  const posLeftHub = computePopoverPosition(150, 450, 118, 340, 420, 1440, 900);
  assert.ok(posLeftHub.x >= 150 + 118);
});

test('simplifyPoints reduces collinear intermediate points', () => {
  const line = [
    { x: 0, y: 0 },
    { x: 10, y: 0.2 },
    { x: 20, y: 0 },
    { x: 30, y: -0.1 },
    { x: 40, y: 0 },
  ];
  const simplified = simplifyPoints(line, 1.0);
  assert.equal(simplified.length, 2);
  assert.deepEqual(simplified[0], { x: 0, y: 0 });
  assert.deepEqual(simplified[1], { x: 40, y: 0 });
});

test('hitTestStroke detects eraser intersection on chalk strokes', () => {
  const stroke: Stroke = {
    id: 's1',
    tool: 'chalk',
    color: '#ffffff',
    width: 4,
    opacity: 1,
    points: [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ],
  };
  assert.equal(hitTestStroke(stroke, { x: 150, y: 105 }, 10), true);
  assert.equal(hitTestStroke(stroke, { x: 150, y: 150 }, 10), false);
});

test('evaluateMathExpression parses quadratic, linear, and trig functions safely', () => {
  assert.equal(evaluateMathExpression('y = x^2 - 4', 3), 5);
  assert.equal(evaluateMathExpression('2x + 1', 5), 11);
  const sinVal = evaluateMathExpression('sin(0)', 0);
  assert.ok(sinVal !== null && Math.abs(sinVal) < 1e-9);
  assert.equal(evaluateMathExpression('1/x', 0), null);
});

test('sampleFunctionPoints returns expected number of points', () => {
  const pts = sampleFunctionPoints('x^2', -2, 2, 10);
  assert.equal(pts.length, 11);
  assert.deepEqual(pts[0], { x: -2, y: 4 });
  assert.deepEqual(pts[5], { x: 0, y: 0 });
});

test('computeTriangleVertices constructs valid geometry inside bounding box', () => {
  const { A, B, C } = computeTriangleVertices(3, 4, 5, 240, 180);
  const sideBC = Math.hypot(C.x - B.x, C.y - B.y);
  const sideAB = Math.hypot(A.x - B.x, A.y - B.y);
  const sideAC = Math.hypot(A.x - C.x, A.y - C.y);
  // 3-4-5 right triangle ratio check
  assert.ok(Math.abs(sideBC / sideAB - 3 / 5) < 0.05);
  assert.ok(Math.abs(sideAC / sideAB - 4 / 5) < 0.05);
});
