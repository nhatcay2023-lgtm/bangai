import React from 'react';
import { computeTriangleVertices, sampleFunctionPoints } from '../utils/boardGeometry';
import { computeWorksheetScale } from '../utils/worksheetGeometry';
import type { BoardItem, BoardTheme, DiagramSpec } from '../types/board';
import { BOARD_THEMES, resolveColorForTheme } from '../constants/boardTheme';

interface DiagramRendererProps {
  diagram: DiagramSpec;
  theme: BoardTheme;
  width?: number;
  height?: number;
}

export const DiagramRenderer: React.FC<DiagramRendererProps> = ({
  diagram,
  theme,
  width = 240,
  height = 160,
}) => {
  const isLight = BOARD_THEMES[theme].isLight;
  const strokeColor = resolveColorForTheme(diagram.color || '#FDE047', theme);
  const labelColor = isLight ? '#0F172A' : '#F8FAFC';
  const mutedColor = isLight ? 'rgba(15, 23, 42, 0.45)' : 'rgba(248, 250, 252, 0.45)';
  const p = diagram.params || {};

  if (diagram.kind === 'triangle') {
    const a = Number(p.a) || 4;
    const b = Number(p.b) || 3;
    const c = Number(p.c) || 5;
    const { A, B, C } = computeTriangleVertices(a, b, c, width, height, 28);
    const midBC = { x: (B.x + C.x) / 2, y: (B.y + C.y) / 2 + 14 };
    const midAC = { x: (A.x + C.x) / 2 + 10, y: (A.y + C.y) / 2 - 4 };
    const midAB = { x: (A.x + B.x) / 2 - 14, y: (A.y + B.y) / 2 };

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full select-none" aria-label={diagram.title}>
        <polygon
          points={`${A.x},${A.y} ${B.x},${B.y} ${C.x},${C.y}`}
          fill={`${strokeColor}18`}
          stroke={strokeColor}
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        {p.rightAngle && (
          <path
            d={`M ${B.x + 12} ${B.y} L ${B.x + 12} ${B.y - 12} L ${B.x} ${B.y - 12}`}
            fill="none"
            stroke={strokeColor}
            strokeWidth={1.6}
          />
        )}
        <circle cx={A.x} cy={A.y} r={3} fill={strokeColor} />
        <circle cx={B.x} cy={B.y} r={3} fill={strokeColor} />
        <circle cx={C.x} cy={C.y} r={3} fill={strokeColor} />
        <text x={A.x - 4} y={A.y - 8} fill={labelColor} fontSize={12} fontWeight={600}>
          A
        </text>
        <text x={B.x - 14} y={B.y + 4} fill={labelColor} fontSize={12} fontWeight={600}>
          B
        </text>
        <text x={C.x + 6} y={C.y + 4} fill={labelColor} fontSize={12} fontWeight={600}>
          C
        </text>
        {p.labelA && (
          <text x={midBC.x} y={midBC.y} textAnchor="middle" fill={strokeColor} fontSize={11} fontFamily="JetBrains Mono, monospace">
            {p.labelA}
          </text>
        )}
        {p.labelB && (
          <text x={midAB.x} y={midAB.y} textAnchor="end" fill={strokeColor} fontSize={11} fontFamily="JetBrains Mono, monospace">
            {p.labelB}
          </text>
        )}
        {p.labelC && (
          <text x={midAC.x} y={midAC.y} textAnchor="start" fill={strokeColor} fontSize={11} fontFamily="JetBrains Mono, monospace">
            {p.labelC}
          </text>
        )}
      </svg>
    );
  }

  if (diagram.kind === 'circle') {
    const cx = width / 2;
    const cy = height / 2 + 2;
    const r = Math.min(width, height) * 0.28;
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full select-none" aria-label={diagram.title}>
        <circle cx={cx} cy={cy} r={r} fill={`${strokeColor}16`} stroke={strokeColor} strokeWidth={2.5} />
        <line x1={cx} y1={cy} x2={cx + r} y2={cy} stroke={strokeColor} strokeWidth={2} strokeDasharray="4 3" />
        <circle cx={cx} cy={cy} r={3.5} fill={strokeColor} />
        <text x={cx - 12} y={cy + 13} fill={labelColor} fontSize={11} fontWeight={600}>
          {p.centerLabel || 'O'}
        </text>
        <text x={cx + r + 8} y={cy + 4} textAnchor="start" fill={strokeColor} fontSize={10} fontFamily="JetBrains Mono, monospace">
          {p.radiusLabel || 'R'}
        </text>
        {p.diameterLabel && (
          <text x={cx} y={cy + r + 15} textAnchor="middle" fill={labelColor} fontSize={10}>
            {p.diameterLabel}
          </text>
        )}
      </svg>
    );
  }

  if (diagram.kind === 'coordinate_graph') {
    const xMin = Number(p.xMin ?? -4);
    const xMax = Number(p.xMax ?? 4);
    const yMin = Number(p.yMin ?? -4);
    const yMax = Number(p.yMax ?? 6);
    const expr = String(p.expression || 'x^2 - 2');
    const pad = 16;
    const plotW = width - pad * 2;
    const plotH = height - pad * 2;

    const toPxX = (x: number) => pad + ((x - xMin) / Math.max(0.1, xMax - xMin)) * plotW;
    const toPxY = (y: number) => pad + plotH - ((y - yMin) / Math.max(0.1, yMax - yMin)) * plotH;

    const originX = toPxX(0);
    const originY = toPxY(0);
    const samples = sampleFunctionPoints(expr, xMin, xMax, 70);

    let pathD = '';
    let drawing = false;
    for (const pt of samples) {
      if (!pt || pt.y < yMin - 2 || pt.y > yMax + 2) {
        drawing = false;
        continue;
      }
      const px = toPxX(pt.x);
      const py = toPxY(pt.y);
      pathD += drawing ? ` L ${px.toFixed(1)} ${py.toFixed(1)}` : ` M ${px.toFixed(1)} ${py.toFixed(1)}`;
      drawing = true;
    }

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full select-none" aria-label={diagram.title}>
        {originY >= pad && originY <= height - pad && (
          <line x1={pad} y1={originY} x2={width - pad} y2={originY} stroke={mutedColor} strokeWidth={1.5} />
        )}
        {originX >= pad && originX <= width - pad && (
          <line x1={originX} y1={pad} x2={originX} y2={height - pad} stroke={mutedColor} strokeWidth={1.5} />
        )}
        <text x={width - pad - 4} y={Math.min(height - pad, Math.max(pad + 12, originY - 6))} fill={mutedColor} fontSize={10}>
          x
        </text>
        <text x={Math.min(width - pad - 10, Math.max(pad + 6, originX + 6))} y={pad + 10} fill={mutedColor} fontSize={10}>
          y
        </text>
        {pathD && <path d={pathD} fill="none" stroke={strokeColor} strokeWidth={2.5} strokeLinecap="round" />}
        <rect x={4} y={3} width={Math.min(width - 12, expr.length * 6.5 + 34)} height={17} rx={4} fill={isLight ? 'rgba(255,255,255,0.88)' : 'rgba(15,23,42,0.85)'} />
        <text x={8} y={14} fill={strokeColor} fontSize={10} fontWeight={600} fontFamily="JetBrains Mono, monospace">
          y = {expr}
        </text>
      </svg>
    );
  }

  if (diagram.kind === 'rectangle') {
    const rw = width * 0.56;
    const rh = height * 0.48;
    const rx = (width - rw) / 2;
    const ry = (height - rh) / 2;
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full select-none" aria-label={diagram.title}>
        <rect x={rx} y={ry} width={rw} height={rh} fill={`${strokeColor}16`} stroke={strokeColor} strokeWidth={2.5} rx={2} />
        <text x={width / 2} y={ry + rh + 16} textAnchor="middle" fill={strokeColor} fontSize={11} fontFamily="JetBrains Mono, monospace">
          {p.widthLabel || 'a'}
        </text>
        <text x={rx - 8} y={height / 2 + 4} textAnchor="end" fill={strokeColor} fontSize={11} fontFamily="JetBrains Mono, monospace">
          {p.heightLabel || 'b'}
        </text>
      </svg>
    );
  }

  if (diagram.kind === 'fraction_bar') {
    const denom = Math.max(1, Math.min(12, Math.round(Number(p.denominator) || 5)));
    const numer = Math.max(0, Math.min(denom, Math.round(Number(p.numerator) || 3)));
    const barW = width - 44;
    const barH = 42;
    const startX = 22;
    const startY = (height - barH) / 2 - 6;
    const cellW = barW / denom;

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full select-none" aria-label={diagram.title}>
        {Array.from({ length: denom }).map((_, idx) => (
          <rect
            key={idx}
            x={startX + idx * cellW}
            y={startY}
            width={cellW}
            height={barH}
            fill={idx < numer ? `${strokeColor}55` : 'transparent'}
            stroke={strokeColor}
            strokeWidth={2}
          />
        ))}
        <text x={width / 2} y={startY + barH + 24} textAnchor="middle" fill={labelColor} fontSize={14} fontWeight={700} fontFamily="JetBrains Mono, monospace">
          {numer} / {denom}
        </text>
      </svg>
    );
  }

  if (diagram.kind === 'angle') {
    const deg = Math.max(10, Math.min(175, Number(p.degrees) || 60));
    const rad = (deg * Math.PI) / 180;
    const ox = width * 0.28;
    const oy = height * 0.72;
    const rayLen = Math.min(width, height) * 0.56;
    const x2 = ox + rayLen * Math.cos(rad);
    const y2 = oy - rayLen * Math.sin(rad);
    const arcR = 34;
    const ax = ox + arcR * Math.cos(rad);
    const ay = oy - arcR * Math.sin(rad);

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full select-none" aria-label={diagram.title}>
        <line x1={ox} y1={oy} x2={ox + rayLen} y2={oy} stroke={strokeColor} strokeWidth={2.5} strokeLinecap="round" />
        <line x1={ox} y1={oy} x2={x2} y2={y2} stroke={strokeColor} strokeWidth={2.5} strokeLinecap="round" />
        <path d={`M ${ox + arcR} ${oy} A ${arcR} ${arcR} 0 0 0 ${ax} ${ay}`} fill="none" stroke={strokeColor} strokeWidth={2} />
        <circle cx={ox} cy={oy} r={3.5} fill={strokeColor} />
        <text x={ox + arcR + 10} y={oy - 12} fill={labelColor} fontSize={13} fontWeight={600} fontFamily="JetBrains Mono, monospace">
          {deg}°
        </text>
      </svg>
    );
  }

  // Formula card fallback
  return (
    <div className="w-full h-full flex flex-col items-center justify-center px-3 text-center select-none">
      <div className="font-serif text-base font-semibold" style={{ color: strokeColor }}>
        {p.formula || diagram.title}
      </div>
      {(p.note || diagram.caption) && (
        <div className="mt-1.5 text-xs leading-snug" style={{ color: labelColor }}>
          {p.note || diagram.caption}
        </div>
      )}
    </div>
  );
};

/**
 * Draws a placed BoardItem directly onto an export 2D canvas context so saved PNG images
 * accurately include all dragged diagrams, transparent worksheets, and highlighted note cards.
 */
export function drawBoardItemToCanvas(
  ctx: CanvasRenderingContext2D,
  item: BoardItem,
  theme: BoardTheme
) {
  const isLight = BOARD_THEMES[theme].isLight;
  const accent = resolveColorForTheme(item.color || '#FDE047', theme);
  const textPrimary = isLight ? '#0F172A' : '#F8FAFC';

  if (item.kind === 'worksheet' && item.worksheet) {
    const ws = item.worksheet;
    const s = computeWorksheetScale(item.width, item.height, ws);
    const padX = 14 * s;
    const topY = item.y + 34 * s;

    ctx.save();
    ctx.textBaseline = 'top';
    ctx.fillStyle = accent;
    ctx.font = `700 ${Math.round(13 * s)}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText(`Bài ${ws.number}: ${ws.instruction}`, item.x + padX, topY);

    ctx.fillStyle = isLight ? '#0F172A' : '#FFFDF7';
    if (ws.layout === 'vertical') {
      const colW = (item.width - padX * 2) / Math.max(1, ws.problems.length);
      const fontSize = Math.round(20 * s);
      ctx.font = `700 ${fontSize}px "JetBrains Mono", monospace`;
      ws.problems.forEach((p, idx) => {
        const cx = item.x + padX + idx * colW + colW * 0.7;
        const py = topY + 26 * s;
        ctx.textAlign = 'right';
        ctx.fillText(p.top || '', cx, py);
        ctx.fillText(`${p.op || '+'} ${p.bottom || ''}`, cx, py + fontSize * 1.15);
        ctx.strokeStyle = isLight ? '#0F172A' : '#FFFDF7';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 42 * s, py + fontSize * 2.45);
        ctx.lineTo(cx + 4 * s, py + fontSize * 2.45);
        ctx.stroke();
      });
      ctx.textAlign = 'left';
    } else if (ws.layout === 'word_problem') {
      const fontSize = Math.round(14 * s);
      ctx.font = `500 ${fontSize}px "Plus Jakarta Sans", sans-serif`;
      ws.problems.forEach((p, idx) => {
        ctx.fillText(p.text || '', item.x + padX, topY + (26 + idx * 24) * s);
      });
    } else {
      const cols = ws.columns === 1 ? 1 : 2;
      const colW = (item.width - padX * 2) / cols;
      const fontSize = Math.round(17 * s);
      ctx.font = `700 ${fontSize}px "JetBrains Mono", monospace`;
      ws.problems.forEach((p, idx) => {
        const c = idx % cols;
        const r = Math.floor(idx / cols);
        ctx.fillText(
          p.text || '',
          item.x + padX + c * colW,
          topY + (28 + r * 32) * s
        );
      });
    }
    ctx.restore();
    return;
  }

  const cardBg = isLight ? 'rgba(255, 255, 255, 0.92)' : 'rgba(15, 23, 42, 0.72)';

  ctx.save();
  // Card container
  ctx.fillStyle = cardBg;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(item.x, item.y, item.width, item.height, 10);
  ctx.fill();
  ctx.stroke();

  // Header strip
  ctx.fillStyle = `${accent}28`;
  ctx.beginPath();
  ctx.roundRect(item.x, item.y, item.width, 28, [10, 10, 0, 0]);
  ctx.fill();

  ctx.fillStyle = textPrimary;
  ctx.font = '600 12px "Plus Jakarta Sans", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(item.title.slice(0, 36), item.x + 12, item.y + 14);

  if (item.kind === 'note' || item.diagram?.kind === 'formula_card') {
    const bodyText = item.content || item.diagram?.params?.formula || item.diagram?.caption || '';
    ctx.fillStyle = textPrimary;
    ctx.font = '500 13px "Lora", serif';
    const words = String(bodyText).split(' ');
    let line = '';
    let ly = item.y + 50;
    const maxW = item.width - 24;
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, item.x + 12, ly);
        line = w;
        ly += 19;
        if (ly > item.y + item.height - 16) break;
      } else {
        line = test;
      }
    }
    if (line && ly <= item.y + item.height - 12) {
      ctx.fillText(line, item.x + 12, ly);
    }
    ctx.restore();
    return;
  }

  const d = item.diagram;
  if (!d) {
    ctx.restore();
    return;
  }

  const innerX = item.x + 10;
  const innerY = item.y + 32;
  const innerW = item.width - 20;
  const innerH = item.height - 44;
  const p = d.params || {};

  ctx.strokeStyle = accent;
  ctx.fillStyle = `${accent}20`;
  ctx.lineWidth = 2.2;

  if (d.kind === 'triangle') {
    const { A, B, C } = computeTriangleVertices(
      Number(p.a) || 4,
      Number(p.b) || 3,
      Number(p.c) || 5,
      innerW,
      innerH,
      24
    );
    ctx.beginPath();
    ctx.moveTo(innerX + A.x, innerY + A.y);
    ctx.lineTo(innerX + B.x, innerY + B.y);
    ctx.lineTo(innerX + C.x, innerY + C.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = textPrimary;
    ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('A', innerX + A.x - 4, innerY + A.y - 10);
    ctx.fillText('B', innerX + B.x - 14, innerY + B.y + 4);
    ctx.fillText('C', innerX + C.x + 6, innerY + C.y + 4);
  } else if (d.kind === 'circle') {
    const cx = innerX + innerW / 2;
    const cy = innerY + innerH / 2;
    const r = Math.min(innerW, innerH) * 0.34;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.setLineDash([4, 3]);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + r, cy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = textPrimary;
    ctx.font = '500 11px "JetBrains Mono", monospace';
    ctx.fillText(String(p.radiusLabel || 'R'), cx + r / 3, cy - 10);
  } else if (d.kind === 'coordinate_graph') {
    const xMin = Number(p.xMin ?? -4);
    const xMax = Number(p.xMax ?? 4);
    const yMin = Number(p.yMin ?? -4);
    const yMax = Number(p.yMax ?? 6);
    const expr = String(p.expression || 'x^2 - 2');
    const pad = 14;
    const plotW = innerW - pad * 2;
    const plotH = innerH - pad * 2;
    const toPxX = (x: number) => innerX + pad + ((x - xMin) / Math.max(0.1, xMax - xMin)) * plotW;
    const toPxY = (y: number) => innerY + pad + plotH - ((y - yMin) / Math.max(0.1, yMax - yMin)) * plotH;

    ctx.strokeStyle = isLight ? 'rgba(15,23,42,0.35)' : 'rgba(248,250,252,0.35)';
    ctx.lineWidth = 1.2;
    const ox = toPxX(0);
    const oy = toPxY(0);
    ctx.beginPath();
    ctx.moveTo(innerX + pad, oy);
    ctx.lineTo(innerX + innerW - pad, oy);
    ctx.moveTo(ox, innerY + pad);
    ctx.lineTo(ox, innerY + innerH - pad);
    ctx.stroke();

    const pts = sampleFunctionPoints(expr, xMin, xMax, 60);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    let started = false;
    for (const pt of pts) {
      if (!pt || pt.y < yMin - 2 || pt.y > yMax + 2) {
        started = false;
        continue;
      }
      const px = toPxX(pt.x);
      const py = toPxY(pt.y);
      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();
  } else if (d.kind === 'fraction_bar') {
    const denom = Math.max(1, Math.min(12, Math.round(Number(p.denominator) || 5)));
    const numer = Math.max(0, Math.min(denom, Math.round(Number(p.numerator) || 3)));
    const barW = innerW - 24;
    const barH = 34;
    const sx = innerX + 12;
    const sy = innerY + (innerH - barH) / 2;
    const cw = barW / denom;
    for (let i = 0; i < denom; i++) {
      ctx.fillStyle = i < numer ? `${accent}66` : 'transparent';
      ctx.fillRect(sx + i * cw, sy, cw, barH);
      ctx.strokeRect(sx + i * cw, sy, cw, barH);
    }
  } else if (d.kind === 'rectangle') {
    const rw = innerW * 0.56;
    const rh = innerH * 0.48;
    ctx.fillRect(innerX + (innerW - rw) / 2, innerY + (innerH - rh) / 2, rw, rh);
    ctx.strokeRect(innerX + (innerW - rw) / 2, innerY + (innerH - rh) / 2, rw, rh);
  } else if (d.kind === 'angle') {
    const deg = Math.max(10, Math.min(175, Number(p.degrees) || 60));
    const rad = (deg * Math.PI) / 180;
    const ox = innerX + innerW * 0.25;
    const oy = innerY + innerH * 0.75;
    const ray = Math.min(innerW, innerH) * 0.55;
    ctx.beginPath();
    ctx.moveTo(ox + ray, oy);
    ctx.lineTo(ox, oy);
    ctx.lineTo(ox + ray * Math.cos(rad), oy - ray * Math.sin(rad));
    ctx.stroke();
  }

  ctx.restore();
}
