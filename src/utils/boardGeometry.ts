import type { Point, Stroke } from '../types/board';

export interface ItemBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clampPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportW: number,
  viewportH: number,
  margin = 12
): Point {
  const maxX = Math.max(margin, viewportW - width - margin);
  const maxY = Math.max(margin, viewportH - height - margin);
  return {
    x: Math.min(Math.max(margin, x), maxX),
    y: Math.min(Math.max(margin, y), maxY),
  };
}

export function clampBoardItemBox(
  box: ItemBox,
  boardW: number,
  boardH: number,
  minW = 140,
  minH = 110,
  maxW = 800,
  maxH = 700,
  margin = 8
): ItemBox {
  const availW = Math.max(minW, boardW - margin * 2);
  const availH = Math.max(minH, boardH - margin * 2);
  const width = Math.round(Math.min(Math.max(minW, box.width), Math.min(maxW, availW)));
  const height = Math.round(Math.min(Math.max(minH, box.height), Math.min(maxH, availH)));
  const pos = clampPosition(box.x, box.y, width, height, boardW, boardH, margin);
  return {
    x: Math.round(pos.x),
    y: Math.round(pos.y),
    width,
    height,
  };
}

export function computePinchItemBox(
  origBox: ItemBox,
  p1Start: Point,
  p2Start: Point,
  p1Curr: Point,
  p2Curr: Point,
  boardW: number,
  boardH: number,
  minW = 140,
  minH = 110,
  maxW = 800,
  maxH = 700,
  margin = 8
): ItemBox {
  const startDist = Math.max(12, Math.hypot(p2Start.x - p1Start.x, p2Start.y - p1Start.y));
  const currDist = Math.max(12, Math.hypot(p2Curr.x - p1Curr.x, p2Curr.y - p1Curr.y));
  const rawScale = currDist / startDist;

  const effMaxW = Math.min(maxW, Math.max(minW, boardW - margin * 2));
  const effMaxH = Math.min(maxH, Math.max(minH, boardH - margin * 2));
  const minScale = Math.max(minW / Math.max(1, origBox.width), minH / Math.max(1, origBox.height));
  const maxScale = Math.max(
    minScale,
    Math.min(effMaxW / Math.max(1, origBox.width), effMaxH / Math.max(1, origBox.height))
  );
  const scale = Math.min(Math.max(rawScale, minScale), maxScale);

  const startMidX = (p1Start.x + p2Start.x) / 2;
  const startMidY = (p1Start.y + p2Start.y) / 2;
  const currMidX = (p1Curr.x + p2Curr.x) / 2;
  const currMidY = (p1Curr.y + p2Curr.y) / 2;

  const relX = startMidX - origBox.x;
  const relY = startMidY - origBox.y;

  return clampBoardItemBox(
    {
      x: currMidX - relX * scale,
      y: currMidY - relY * scale,
      width: origBox.width * scale,
      height: origBox.height * scale,
    },
    boardW,
    boardH,
    minW,
    minH,
    maxW,
    maxH,
    margin
  );
}

export interface RadialRingLayout {
  hubCenter: Point;
  items: Point[];
}

export function computeRadialRingPositions(
  hubCenterX: number,
  hubCenterY: number,
  count: number,
  ringRadius: number,
  itemRadius: number,
  viewportW: number,
  viewportH: number,
  topOffset = 68,
  margin = 14
): RadialRingLayout {
  const safePad = ringRadius + itemRadius + margin;
  const minX = safePad;
  const maxX = Math.max(minX, viewportW - safePad);
  const minY = topOffset + ringRadius + itemRadius;
  const maxY = Math.max(minY, viewportH - safePad);

  const safeCx = Math.min(Math.max(minX, hubCenterX), maxX);
  const safeCy = Math.min(Math.max(minY, hubCenterY), maxY);

  const items: Point[] = [];
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, count);
    items.push({
      x: Math.round(safeCx + ringRadius * Math.cos(angle)),
      y: Math.round(safeCy + ringRadius * Math.sin(angle)),
    });
  }

  return {
    hubCenter: { x: Math.round(safeCx), y: Math.round(safeCy) },
    items,
  };
}

export function computePopoverPosition(
  hubCenterX: number,
  hubCenterY: number,
  ringExtent: number,
  popW: number,
  popH: number,
  viewportW: number,
  viewportH: number,
  topOffset = 68,
  margin = 14
): Point {
  const spaceRight = viewportW - (hubCenterX + ringExtent + margin);
  const spaceLeft = hubCenterX - ringExtent - margin;

  let rawX: number;
  let rawY: number;

  if (spaceRight >= popW) {
    rawX = hubCenterX + ringExtent + 12;
    rawY = hubCenterY - popH / 2;
  } else if (spaceLeft >= popW) {
    rawX = hubCenterX - ringExtent - 12 - popW;
    rawY = hubCenterY - popH / 2;
  } else {
    // Narrow screen fallback: place above or below the ring
    rawX = (viewportW - popW) / 2;
    const spaceAbove = hubCenterY - ringExtent - topOffset - margin;
    if (spaceAbove >= popH) {
      rawY = hubCenterY - ringExtent - popH - 12;
    } else {
      rawY = hubCenterY + ringExtent + 12;
    }
  }

  const maxX = Math.max(margin, viewportW - popW - margin);
  const minY = topOffset;
  const maxY = Math.max(minY, viewportH - popH - margin);

  return {
    x: Math.round(Math.min(Math.max(margin, rawX), maxX)),
    y: Math.round(Math.min(Math.max(minY, rawY), maxY)),
  };
}

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

export function simplifyPoints(points: Point[], tolerance = 1.4): Point[] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let index = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist > tolerance) {
    const left = simplifyPoints(points.slice(0, index + 1), tolerance);
    const right = simplifyPoints(points.slice(index), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}

export function distancePointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function hitTestStroke(stroke: Stroke, point: Point, eraserRadius: number): boolean {
  if (stroke.tool === 'eraser') return false;
  const threshold = eraserRadius + stroke.width / 2;
  const pts = stroke.points;
  if (pts.length === 0) return false;
  if (pts.length === 1) {
    return Math.hypot(point.x - pts[0].x, point.y - pts[0].y) <= threshold;
  }
  if (stroke.tool === 'rect' && pts.length >= 2) {
    const p0 = pts[0];
    const p1 = pts[pts.length - 1];
    const minX = Math.min(p0.x, p1.x);
    const maxX = Math.max(p0.x, p1.x);
    const minY = Math.min(p0.y, p1.y);
    const maxY = Math.max(p0.y, p1.y);
    const edges: [Point, Point][] = [
      [{ x: minX, y: minY }, { x: maxX, y: minY }],
      [{ x: maxX, y: minY }, { x: maxX, y: maxY }],
      [{ x: maxX, y: maxY }, { x: minX, y: maxY }],
      [{ x: minX, y: maxY }, { x: minX, y: minY }],
    ];
    return edges.some(([a, b]) => distancePointToSegment(point, a, b) <= threshold);
  }
  if (stroke.tool === 'circle' && pts.length >= 2) {
    const p0 = pts[0];
    const p1 = pts[pts.length - 1];
    const r = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const distToCenter = Math.hypot(point.x - p0.x, point.y - p0.y);
    return Math.abs(distToCenter - r) <= threshold;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    if (distancePointToSegment(point, pts[i], pts[i + 1]) <= threshold) {
      return true;
    }
  }
  return false;
}

type Token =
  | { type: 'num'; value: number }
  | { type: 'id'; value: string }
  | { type: 'op'; value: string }
  | { type: 'paren'; value: '(' | ')' };

function tokenizeMath(raw: string): Token[] {
  const clean = raw.replace(/\s+/g, '').replace(/,/g, '.').toLowerCase();
  const tokens: Token[] = [];
  let i = 0;

  while (i < clean.length) {
    const ch = clean[i];
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let numStr = ch;
      i++;
      while (i < clean.length && ((clean[i] >= '0' && clean[i] <= '9') || clean[i] === '.')) {
        numStr += clean[i];
        i++;
      }
      const val = Number(numStr);
      if (Number.isNaN(val)) return [];
      // Implicit multiplication like 2x or 2(x+1)
      tokens.push({ type: 'num', value: val });
      if (i < clean.length && (clean[i] === 'x' || clean[i] === '(' || (clean[i] >= 'a' && clean[i] <= 'z'))) {
        tokens.push({ type: 'op', value: '*' });
      }
      continue;
    }

    if (ch >= 'a' && ch <= 'z') {
      let ident = ch;
      i++;
      while (i < clean.length && clean[i] >= 'a' && clean[i] <= 'z') {
        ident += clean[i];
        i++;
      }
      tokens.push({ type: 'id', value: ident });
      if (i < clean.length && clean[i] === '(' && ident === 'x') {
        tokens.push({ type: 'op', value: '*' });
      }
      continue;
    }

    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '^') {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }

    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch });
      i++;
      if (ch === ')' && i < clean.length && (clean[i] === 'x' || clean[i] === '(' || (clean[i] >= '0' && clean[i] <= '9'))) {
        tokens.push({ type: 'op', value: '*' });
      }
      continue;
    }

    return [];
  }
  return tokens;
}

export function evaluateMathExpression(expr: string, xVal: number): number | null {
  const normalized = expr.replace(/^y\s*=\s*/i, '').replace(/^f\(x\)\s*=\s*/i, '');
  const tokens = tokenizeMath(normalized);
  if (tokens.length === 0) return null;

  let pos = 0;

  function peek(): Token | undefined {
    return tokens[pos];
  }

  function consume(): Token {
    return tokens[pos++];
  }

  function parseExpression(): number | null {
    let left = parseTerm();
    if (left === null) return null;

    while (peek()?.type === 'op' && (peek()?.value === '+' || peek()?.value === '-')) {
      const op = consume().value;
      const right = parseTerm();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number | null {
    let left = parsePower();
    if (left === null) return null;

    while (peek()?.type === 'op' && (peek()?.value === '*' || peek()?.value === '/')) {
      const op = consume().value;
      const right = parsePower();
      if (right === null) return null;
      if (op === '/') {
        if (Math.abs(right) < 1e-9) return null;
        left = left / right;
      } else {
        left = left * right;
      }
    }
    return left;
  }

  function parsePower(): number | null {
    const base = parseUnary();
    if (base === null) return null;
    if (peek()?.type === 'op' && peek()?.value === '^') {
      consume();
      const exp = parsePower();
      if (exp === null) return null;
      const res = Math.pow(base, exp);
      return Number.isFinite(res) ? res : null;
    }
    return base;
  }

  function parseUnary(): number | null {
    if (peek()?.type === 'op' && (peek()?.value === '-' || peek()?.value === '+')) {
      const op = consume().value;
      const val = parseUnary();
      if (val === null) return null;
      return op === '-' ? -val : val;
    }
    return parsePrimary();
  }

  function parsePrimary(): number | null {
    const t = peek();
    if (!t) return null;

    if (t.type === 'num') {
      consume();
      return t.value;
    }

    if (t.type === 'paren' && t.value === '(') {
      consume();
      const inner = parseExpression();
      if (inner === null) return null;
      const close = peek();
      if (!close || close.type !== 'paren' || close.value !== ')') return null;
      consume();
      return inner;
    }

    if (t.type === 'id') {
      consume();
      if (t.value === 'x') return xVal;
      if (t.value === 'pi') return Math.PI;
      if (t.value === 'e') return Math.E;

      // Function call
      const next = peek();
      if (!next || next.type !== 'paren' || next.value !== '(') return null;
      consume();
      const arg = parseExpression();
      if (arg === null) return null;
      const close = peek();
      if (!close || close.type !== 'paren' || close.value !== ')') return null;
      consume();

      switch (t.value) {
        case 'sin':
          return Math.sin(arg);
        case 'cos':
          return Math.cos(arg);
        case 'tan':
          return Math.abs(Math.cos(arg)) < 1e-6 ? null : Math.tan(arg);
        case 'sqrt':
          return arg < 0 ? null : Math.sqrt(arg);
        case 'abs':
          return Math.abs(arg);
        case 'ln':
          return arg <= 0 ? null : Math.log(arg);
        default:
          return null;
      }
    }

    return null;
  }

  const result = parseExpression();
  if (result === null || pos !== tokens.length || !Number.isFinite(result)) {
    return null;
  }
  return result;
}

export function sampleFunctionPoints(
  expr: string,
  xMin: number,
  xMax: number,
  steps = 60
): (Point | null)[] {
  const result: (Point | null)[] = [];
  const step = (xMax - xMin) / Math.max(1, steps);
  for (let i = 0; i <= steps; i++) {
    const x = xMin + i * step;
    const y = evaluateMathExpression(expr, x);
    result.push(y === null ? null : { x, y });
  }
  return result;
}

export function computeTriangleVertices(
  aInput: number,
  bInput: number,
  cInput: number,
  boxW: number,
  boxH: number,
  padding = 28
): { A: Point; B: Point; C: Point } {
  const a = Math.max(1, aInput || 3);
  const b = Math.max(1, bInput || 4);
  const c = Math.max(1, cInput || 5);

  // Validate triangle inequality, fall back to 3-4-5 right triangle if invalid
  const valid = a + b > c && a + c > b && b + c > a;
  const sA = valid ? a : 3;
  const sB = valid ? b : 4;
  const sC = valid ? c : 5;

  // Place base BC horizontally: B=(0,0), C=(sA,0)
  // Law of cosines for angle at B: cos(B) = (sA^2 + sC^2 - sB^2) / (2*sA*sC)
  const cosB = Math.max(-1, Math.min(1, (sA * sA + sC * sC - sB * sB) / (2 * sA * sC)));
  const sinB = Math.sqrt(Math.max(0, 1 - cosB * cosB));

  const rawA = { x: sC * cosB, y: -sC * sinB };
  const rawB = { x: 0, y: 0 };
  const rawC = { x: sA, y: 0 };

  const minX = Math.min(rawA.x, rawB.x, rawC.x);
  const maxX = Math.max(rawA.x, rawB.x, rawC.x);
  const minY = Math.min(rawA.y, rawB.y, rawC.y);
  const maxY = Math.max(rawA.y, rawB.y, rawC.y);

  const rawW = Math.max(0.001, maxX - minX);
  const rawH = Math.max(0.001, maxY - minY);

  const availW = Math.max(40, boxW - padding * 2);
  const availH = Math.max(40, boxH - padding * 2);
  const scale = Math.min(availW / rawW, availH / rawH);

  const offsetX = (boxW - rawW * scale) / 2 - minX * scale;
  const offsetY = (boxH - rawH * scale) / 2 - minY * scale;

  return {
    A: { x: rawA.x * scale + offsetX, y: rawA.y * scale + offsetY },
    B: { x: rawB.x * scale + offsetX, y: rawB.y * scale + offsetY },
    C: { x: rawC.x * scale + offsetX, y: rawC.y * scale + offsetY },
  };
}
