import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  RotateCw,
  Search,
  X,
} from 'lucide-react';
import { BOARD_THEMES } from '../constants/boardTheme';
import type { BoardTheme, Point } from '../types/board';
import type { ActiveStudyTool, StudyToolKind } from '../types/tools';
import {
  computeCompassArcPoints,
  computeParabolaPoints,
  computeProtractorRayPoints,
  computeRulerEdgeSegment,
  computeSegmentMeasurement,
  computeSetSquareVertices,
  formatTimerClock,
  PX_PER_CM,
  pxToCm,
} from '../utils/studyToolsGeometry';

interface StudyToolsOverlayProps {
  tools: ActiveStudyTool[];
  theme: BoardTheme;
  stageRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  strokesVersion: number;
  onUpdateTool: (id: StudyToolKind, patch: Partial<ActiveStudyTool>) => void;
  onCommitPoints: (points: Point[], label?: string, sharpCorners?: boolean) => void;
}

type ToolDragAction = {
  toolId: StudyToolKind;
  kind:
    | 'move'
    | 'ruler_end'
    | 'compass_radius'
    | 'compass_sweep'
    | 'protractor_rotate'
    | 'protractor_arm'
    | 'set_square_rotate'
    | 'tape_a'
    | 'tape_b'
    | 'parabola_rotate';
  pointerId: number;
  startPt: Point;
  origX: number;
  origY: number;
  origEndX: number;
  origEndY: number;
  origAngle: number;
  origLength: number;
  origRadius: number;
  sweepStartAngleDeg: number;
  currentSweepDeg: number;
};

export const StudyToolsOverlay: React.FC<StudyToolsOverlayProps> = ({
  tools,
  theme,
  stageRef,
  canvasRef,
  strokesVersion,
  onUpdateTool,
  onCommitPoints,
}) => {
  const dragRef = useRef<ToolDragAction | null>(null);
  const [compassSweepPreview, setCompassSweepPreview] = useState<{
    cx: number;
    cy: number;
    radiusPx: number;
    startAngleDeg: number;
    sweepDeg: number;
  } | null>(null);

  const magnifierCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const magnifierTool = tools.find((t) => t.id === 'magnifier' && t.enabled);

  const toStagePoint = (clientX: number, clientY: number): Point => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: clientX, y: clientY };
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  // Timer 1-second tick loop
  const timerTool = tools.find((t) => t.id === 'timer' && t.enabled && t.timerRunning);
  useEffect(() => {
    if (!timerTool) return;
    const interval = window.setInterval(() => {
      if (timerTool.timerMode === 'countdown') {
        if (timerTool.timerSeconds <= 1) {
          onUpdateTool('timer', { timerSeconds: 0, timerRunning: false });
        } else {
          onUpdateTool('timer', { timerSeconds: timerTool.timerSeconds - 1 });
        }
      } else {
        onUpdateTool('timer', { timerSeconds: timerTool.timerSeconds + 1 });
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timerTool, onUpdateTool]);

  // Optical Magnifier live canvas render
  useEffect(() => {
    if (!magnifierTool) return;
    const lensCanvas = magnifierCanvasRef.current;
    const mainCanvas = canvasRef.current;
    if (!lensCanvas || !mainCanvas) return;

    const ctx = lensCanvas.getContext('2d');
    if (!ctx) return;

    const size = 176;
    const dpr = window.devicePixelRatio || 1;
    if (lensCanvas.width !== size * dpr) {
      lensCanvas.width = size * dpr;
      lensCanvas.height = size * dpr;
    }

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    // Fill board background behind magnified strokes
    ctx.fillStyle = BOARD_THEMES[theme].bgHex;
    ctx.fillRect(0, 0, size, size);

    const zoom = magnifierTool.zoom || 2.2;
    const srcW = (size / zoom) * dpr;
    const srcH = (size / zoom) * dpr;
    const srcX = magnifierTool.x * dpr - srcW / 2;
    const srcY = magnifierTool.y * dpr - srcH / 2;

    try {
      ctx.drawImage(mainCanvas, srcX, srcY, srcW, srcH, 0, 0, size, size);
    } catch {
      // ignore if canvas not ready
    }
    ctx.restore();
  }, [
    magnifierTool,
    magnifierTool?.x,
    magnifierTool?.y,
    magnifierTool?.zoom,
    theme,
    strokesVersion,
    canvasRef,
  ]);

  const startDrag = (
    e: React.PointerEvent<HTMLElement | SVGElement>,
    tool: ActiveStudyTool,
    kind: ToolDragAction['kind']
  ) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-tool-btn="true"]')) return;

    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const pt = toStagePoint(e.clientX, e.clientY);
    dragRef.current = {
      toolId: tool.id,
      kind,
      pointerId: e.pointerId,
      startPt: pt,
      origX: tool.x,
      origY: tool.y,
      origEndX: tool.endX,
      origEndY: tool.endY,
      origAngle: tool.angleDeg,
      origLength: tool.lengthPx,
      origRadius: tool.radiusPx,
      sweepStartAngleDeg: tool.angleDeg,
      currentSweepDeg: 10,
    };

    if (kind === 'compass_sweep') {
      setCompassSweepPreview({
        cx: tool.x,
        cy: tool.y,
        radiusPx: tool.radiusPx,
        startAngleDeg: tool.angleDeg,
        sweepDeg: 10,
      });
    }
  };

  const moveDrag = (e: React.PointerEvent<HTMLElement | SVGElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    e.stopPropagation();

    const pt = toStagePoint(e.clientX, e.clientY);
    const rect = stageRef.current?.getBoundingClientRect();
    const maxW = rect ? rect.width : 1440;
    const maxH = rect ? rect.height : 900;
    const dx = pt.x - d.startPt.x;
    const dy = pt.y - d.startPt.y;

    if (d.kind === 'move') {
      onUpdateTool(d.toolId, {
        x: Math.round(Math.max(16, Math.min(maxW - 16, d.origX + dx))),
        y: Math.round(Math.max(16, Math.min(maxH - 16, d.origY + dy))),
      });
      return;
    }

    if (d.kind === 'ruler_end') {
      const vx = pt.x - d.origX;
      const vy = pt.y - d.origY;
      const len = Math.max(152, Math.min(646, Math.round(Math.hypot(vx, vy))));
      const deg = Math.round((Math.atan2(vy, vx) * 180) / Math.PI);
      onUpdateTool('ruler', { lengthPx: len, angleDeg: deg });
      return;
    }

    if (d.kind === 'compass_radius') {
      const vx = pt.x - d.origX;
      const vy = pt.y - d.origY;
      const r = Math.max(38, Math.min(260, Math.round(Math.hypot(vx, vy))));
      const deg = Math.round((Math.atan2(vy, vx) * 180) / Math.PI);
      onUpdateTool('compass', { radiusPx: r, angleDeg: deg });
      return;
    }

    if (d.kind === 'compass_sweep') {
      const vx = pt.x - d.origX;
      const vy = pt.y - d.origY;
      const currDeg = (Math.atan2(vy, vx) * 180) / Math.PI;
      let delta = (currDeg - d.sweepStartAngleDeg + 360) % 360;
      if (delta < 8) delta = 360;
      d.currentSweepDeg = Math.round(delta);
      onUpdateTool('compass', { angleDeg: Math.round(currDeg) });
      setCompassSweepPreview({
        cx: d.origX,
        cy: d.origY,
        radiusPx: d.origRadius,
        startAngleDeg: d.sweepStartAngleDeg,
        sweepDeg: d.currentSweepDeg,
      });
      return;
    }

    if (d.kind === 'protractor_rotate') {
      const deg = Math.round((Math.atan2(pt.y - d.origY, pt.x - d.origX) * 180) / Math.PI);
      onUpdateTool('protractor', { angleDeg: deg });
      return;
    }

    if (d.kind === 'protractor_arm') {
      const pointerDeg = (Math.atan2(pt.y - d.origY, pt.x - d.origX) * 180) / Math.PI;
      let rel = (d.origAngle - pointerDeg + 360) % 360;
      if (rel > 270) rel = 0;
      if (rel > 180) rel = 180;
      onUpdateTool('protractor', { measureAngleDeg: Math.round(rel) });
      return;
    }

    if (d.kind === 'set_square_rotate') {
      const vx = pt.x - d.origX;
      const vy = pt.y - d.origY;
      const len = Math.max(140, Math.min(340, Math.round(Math.hypot(vx, vy))));
      const deg = Math.round((Math.atan2(vy, vx) * 180) / Math.PI);
      onUpdateTool('set_square', { lengthPx: len, angleDeg: deg });
      return;
    }

    if (d.kind === 'tape_a') {
      onUpdateTool('measure_tape', {
        x: Math.round(Math.max(16, Math.min(maxW - 16, pt.x))),
        y: Math.round(Math.max(16, Math.min(maxH - 16, pt.y))),
      });
      return;
    }

    if (d.kind === 'tape_b') {
      onUpdateTool('measure_tape', {
        endX: Math.round(Math.max(16, Math.min(maxW - 16, pt.x))),
        endY: Math.round(Math.max(16, Math.min(maxH - 16, pt.y))),
      });
      return;
    }

    if (d.kind === 'parabola_rotate') {
      const deg = Math.round((Math.atan2(pt.y - d.origY, pt.x - d.origX) * 180) / Math.PI);
      onUpdateTool('parabola_ruler', { angleDeg: deg });
    }
  };

  const endDrag = (e: React.PointerEvent<HTMLElement | SVGElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    e.stopPropagation();

    try {
      if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }

    if (d.kind === 'compass_sweep' && compassSweepPreview) {
      const pts = computeCompassArcPoints(
        compassSweepPreview.cx,
        compassSweepPreview.cy,
        compassSweepPreview.radiusPx,
        compassSweepPreview.startAngleDeg,
        compassSweepPreview.sweepDeg
      );
      onCommitPoints(pts, `Đã quay vẽ cung ${compassSweepPreview.sweepDeg}° bằng Compa`);
      setCompassSweepPreview(null);
    }

    dragRef.current = null;
  };

  const activeTools = tools.filter((t) => t.enabled);
  if (activeTools.length === 0) return null;

  const isLight = BOARD_THEMES[theme].isLight;
  const linePreviewColor = isLight ? '#0F172A' : '#FDE047';

  return (
    <div
      data-testid="study-tools-overlay"
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
    >
      {activeTools.map((tool) => {
        /* 1. THƯỚC KẺ (RULER) */
        if (tool.id === 'ruler') {
          const cmCount = Math.floor(tool.lengthPx / PX_PER_CM);
          const edge = computeRulerEdgeSegment(tool.x, tool.y, tool.lengthPx, tool.angleDeg);
          return (
            <div
              key="ruler"
              data-testid="active-tool-ruler"
              onPointerDown={(e) => startDrag(e, tool, 'move')}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              style={{
                width: tool.lengthPx,
                height: 54,
                transform: `translate3d(${tool.x}px, ${tool.y}px, 0) rotate(${tool.angleDeg}deg)`,
                transformOrigin: '0 0',
              }}
              className="pointer-events-auto absolute top-0 left-0 rounded-b-lg bg-amber-200/82 text-slate-900 border-2 border-amber-500 shadow-xl backdrop-blur-[2px] cursor-grab active:cursor-grabbing touch-none select-none"
            >
              {/* Graduated centimeter ticks along top straightedge */}
              <div className="relative w-full h-5 border-b border-amber-700/30">
                {Array.from({ length: cmCount * 5 + 1 }).map((_, idx) => {
                  const leftPx = idx * (PX_PER_CM / 5);
                  if (leftPx > tool.lengthPx - 4) return null;
                  const isCm = idx % 5 === 0;
                  return (
                    <div
                      key={idx}
                      style={{ left: leftPx }}
                      className="absolute top-0 flex flex-col items-center"
                    >
                      <div
                        className={`w-px bg-slate-900 ${isCm ? 'h-3' : 'h-1.5 opacity-60'}`}
                      />
                      {isCm && (
                        <span className="text-[9px] font-mono font-bold leading-none mt-0.5 -translate-x-1/2">
                          {idx / 5}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Ruler controls bar */}
              <div className="flex items-center justify-between px-2 pt-1 text-[10px] font-semibold">
                <span className="font-mono tabular-nums">
                  {pxToCm(tool.lengthPx)} cm · {tool.angleDeg}°
                </span>
                <div className="flex items-center gap-1 pr-5">
                  <button
                    type="button"
                    data-tool-btn="true"
                    onClick={() =>
                      onCommitPoints([edge.a, edge.b], 'Đã kẻ đoạn thẳng theo mép thước', true)
                    }
                    className="px-1.5 py-0.5 rounded bg-slate-900 text-amber-300 hover:bg-slate-800 flex items-center gap-0.5"
                  >
                    <Pencil className="w-2.5 h-2.5" />
                    <span>Kẻ</span>
                  </button>
                  <button
                    type="button"
                    data-tool-btn="true"
                    aria-label="Đóng Thước kẻ"
                    onClick={() => onUpdateTool('ruler', { enabled: false })}
                    className="p-0.5 rounded hover:bg-slate-900/15"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* End rotate & resize handle */}
              <div
                onPointerDown={(e) => startDrag(e, tool, 'ruler_end')}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                title="Kéo để xoay và chỉnh độ dài thước"
                className="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-900 text-amber-300 flex items-center justify-center cursor-ew-resize shadow"
              >
                <RotateCw className="w-3 h-3" />
              </div>
            </div>
          );
        }

        /* 2. COMPA (COMPASS) */
        if (tool.id === 'compass') {
          const rad = (tool.angleDeg * Math.PI) / 180;
          const tipX = tool.x + tool.radiusPx * Math.cos(rad);
          const tipY = tool.y + tool.radiusPx * Math.sin(rad);
          const apexX = (tool.x + tipX) / 2 + Math.sin(rad) * 44;
          const apexY = (tool.y + tipY) / 2 - Math.cos(rad) * 44;
          const sweepArcPath = compassSweepPreview
            ? computeCompassArcPoints(
                compassSweepPreview.cx,
                compassSweepPreview.cy,
                compassSweepPreview.radiusPx,
                compassSweepPreview.startAngleDeg,
                compassSweepPreview.sweepDeg,
                48
              )
                .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`)
                .join(' ')
            : '';

          return (
            <div key="compass" data-testid="active-tool-compass" className="contents">
              <svg className="pointer-events-none absolute inset-0 w-full h-full">
                {/* Dashed radius preview circle */}
                <circle
                  cx={tool.x}
                  cy={tool.y}
                  r={tool.radiusPx}
                  fill="none"
                  stroke={linePreviewColor}
                  strokeOpacity={0.35}
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                />
                {sweepArcPath && (
                  <path
                    d={sweepArcPath}
                    fill="none"
                    stroke="#FBBF24"
                    strokeWidth={3}
                    strokeLinecap="round"
                  />
                )}
                {/* Radius segment */}
                <line
                  x1={tool.x}
                  y1={tool.y}
                  x2={tipX}
                  y2={tipY}
                  stroke="#38BDF8"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                />
                {/* Compass legs */}
                <line
                  x1={tool.x}
                  y1={tool.y}
                  x2={apexX}
                  y2={apexY}
                  stroke="#CBD5E1"
                  strokeWidth={5}
                  strokeLinecap="round"
                />
                <line
                  x1={tipX}
                  y1={tipY}
                  x2={apexX}
                  y2={apexY}
                  stroke="#94A3B8"
                  strokeWidth={5}
                  strokeLinecap="round"
                />
                <circle cx={apexX} cy={apexY} r={7} fill="#0F172A" stroke="#FBBF24" strokeWidth={2} />
              </svg>

              {/* Pivot handle O (drag to move center) */}
              <div
                onPointerDown={(e) => startDrag(e, tool, 'move')}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                style={{ transform: `translate3d(${tool.x - 16}px, ${tool.y - 16}px, 0)` }}
                title="Kéo tâm O của compa"
                className="pointer-events-auto absolute top-0 left-0 w-8 h-8 rounded-full bg-slate-900/95 border-2 border-sky-400 text-sky-200 flex items-center justify-center text-xs font-bold cursor-grab active:cursor-grabbing touch-none shadow-lg"
              >
                O
              </div>

              {/* Pencil leg handle R (drag to set radius) */}
              <div
                onPointerDown={(e) => startDrag(e, tool, 'compass_radius')}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                style={{ transform: `translate3d(${tipX - 14}px, ${tipY - 14}px, 0)` }}
                title="Kéo để chỉnh bán kính R"
                className="pointer-events-auto absolute top-0 left-0 w-7 h-7 rounded-full bg-amber-400 border-2 border-slate-900 text-slate-950 flex items-center justify-center cursor-crosshair touch-none shadow-lg"
              >
                <Pencil className="w-3.5 h-3.5" />
              </div>

              {/* Sweep-to-draw handle */}
              <div
                onPointerDown={(e) => startDrag(e, tool, 'compass_sweep')}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                style={{
                  transform: `translate3d(${apexX - 13}px, ${apexY - 13}px, 0)`,
                }}
                title="Xoay quanh tâm O để vẽ cung tròn"
                className="pointer-events-auto absolute top-0 left-0 w-6 h-6 rounded-full bg-emerald-400 border-2 border-slate-900 text-slate-950 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none shadow-lg"
              >
                <RotateCw className="w-3 h-3" />
              </div>

              {/* Compact control bar below O */}
              <div
                style={{ transform: `translate3d(${tool.x - 95}px, ${tool.y + 24}px, 0)` }}
                className="pointer-events-auto absolute top-0 left-0 px-2.5 py-1 rounded-xl bg-slate-900/95 border border-white/15 text-slate-100 text-[11px] flex items-center gap-2 shadow-xl"
              >
                <span className="font-mono text-sky-300 font-semibold">
                  R = {pxToCm(tool.radiusPx)} cm
                </span>
                <button
                  type="button"
                  data-tool-btn="true"
                  onClick={() =>
                    onCommitPoints(
                      computeCompassArcPoints(tool.x, tool.y, tool.radiusPx, 0, 360),
                      `Đã vẽ đường tròn bán kính ${pxToCm(tool.radiusPx)} cm`
                    )
                  }
                  className="px-2 py-0.5 rounded bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold"
                >
                  Vẽ tròn
                </button>
                <button
                  type="button"
                  data-tool-btn="true"
                  aria-label="Đóng Compa"
                  onClick={() => onUpdateTool('compass', { enabled: false })}
                  className="p-0.5 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        }

        /* 3. THƯỚC ĐO ĐỘ (PROTRACTOR) */
        if (tool.id === 'protractor') {
          const r = tool.radiusPx;
          const rays = computeProtractorRayPoints(
            tool.x,
            tool.y,
            r,
            tool.angleDeg,
            tool.measureAngleDeg
          );
          const armRad = ((tool.angleDeg - tool.measureAngleDeg) * Math.PI) / 180;
          const baseRad = (tool.angleDeg * Math.PI) / 180;
          const baseHandle = {
            x: tool.x + r * Math.cos(baseRad),
            y: tool.y + r * Math.sin(baseRad),
          };
          const armHandle = {
            x: tool.x + (r - 6) * Math.cos(armRad),
            y: tool.y + (r - 6) * Math.sin(armRad),
          };

          return (
            <div key="protractor" data-testid="active-tool-protractor" className="contents">
              {/* Protractor SVG body centered at (tool.x, tool.y) */}
              <div
                onPointerDown={(e) => startDrag(e, tool, 'move')}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                style={{
                  width: r * 2 + 20,
                  height: r + 32,
                  transform: `translate3d(${tool.x - (r + 10)}px, ${tool.y - (r + 10)}px, 0) rotate(${tool.angleDeg}deg)`,
                  transformOrigin: `${r + 10}px ${r + 10}px`,
                }}
                className="pointer-events-auto absolute top-0 left-0 cursor-grab active:cursor-grabbing touch-none select-none"
              >
                <svg width={r * 2 + 20} height={r + 32}>
                  <path
                    d={`M 10 ${r + 10} A ${r} ${r} 0 0 1 ${r * 2 + 10} ${r + 10} Z`}
                    fill="rgba(56, 189, 248, 0.22)"
                    stroke="#38BDF8"
                    strokeWidth={2}
                  />
                  {/* Degree tick marks */}
                  {Array.from({ length: 19 }).map((_, idx) => {
                    const deg = idx * 10;
                    const rad = (deg * Math.PI) / 180;
                    const cx = r + 10;
                    const cy = r + 10;
                    const isMajor = deg % 30 === 0;
                    const innerR = isMajor ? r - 14 : r - 7;
                    const x1 = cx + innerR * Math.cos(rad);
                    const y1 = cy - innerR * Math.sin(rad);
                    const x2 = cx + r * Math.cos(rad);
                    const y2 = cy - r * Math.sin(rad);
                    const lx = cx + (r - 24) * Math.cos(rad);
                    const ly = cy - (r - 24) * Math.sin(rad);
                    return (
                      <g key={deg}>
                        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#E0F2FE" strokeWidth={isMajor ? 1.5 : 1} />
                        {isMajor && (
                          <text
                            x={lx}
                            y={ly + 3}
                            textAnchor="middle"
                            fill="#F8FAFC"
                            fontSize={9}
                            fontFamily="JetBrains Mono, monospace"
                          >
                            {deg}
                          </text>
                        )}
                      </g>
                    );
                  })}
                  {/* Center crosshair */}
                  <circle cx={r + 10} cy={r + 10} r={4} fill="#FBBF24" />
                </svg>
              </div>

              {/* Angle measurement ray */}
              <svg className="pointer-events-none absolute inset-0 w-full h-full">
                <line
                  x1={tool.x}
                  y1={tool.y}
                  x2={rays.rayThetaEnd.x}
                  y2={rays.rayThetaEnd.y}
                  stroke="#FBBF24"
                  strokeWidth={2.5}
                />
              </svg>

              {/* Baseline rotate handle */}
              <div
                onPointerDown={(e) => startDrag(e, tool, 'protractor_rotate')}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                style={{ transform: `translate3d(${baseHandle.x - 12}px, ${baseHandle.y - 12}px, 0)` }}
                title="Xoay vạch 0° của thước đo độ"
                className="pointer-events-auto absolute top-0 left-0 w-6 h-6 rounded-full bg-sky-400 border-2 border-slate-900 text-slate-950 flex items-center justify-center cursor-grab touch-none shadow"
              >
                <RotateCw className="w-3 h-3" />
              </div>

              {/* Angle arm handle */}
              <div
                onPointerDown={(e) => startDrag(e, tool, 'protractor_arm')}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                style={{ transform: `translate3d(${armHandle.x - 12}px, ${armHandle.y - 12}px, 0)` }}
                title="Kéo kim đo góc (0°–180°)"
                className="pointer-events-auto absolute top-0 left-0 w-6 h-6 rounded-full bg-amber-400 border-2 border-slate-900 text-slate-950 flex items-center justify-center text-[9px] font-bold cursor-pointer touch-none shadow"
              >
                °
              </div>

              {/* Protractor readout & draw action */}
              <div
                style={{ transform: `translate3d(${tool.x - 76}px, ${tool.y + 18}px, 0)` }}
                className="pointer-events-auto absolute top-0 left-0 px-2.5 py-1 rounded-xl bg-slate-900/95 border border-white/15 text-slate-100 text-[11px] flex items-center gap-2 shadow-xl"
              >
                <span className="font-mono font-bold text-amber-300">{tool.measureAngleDeg}°</span>
                <button
                  type="button"
                  data-tool-btn="true"
                  onClick={() =>
                    onCommitPoints(
                      rays.polyline,
                      `Đã vẽ góc ${tool.measureAngleDeg}° từ thước đo độ`,
                      true
                    )
                  }
                  className="px-2 py-0.5 rounded bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold"
                >
                  Vẽ góc
                </button>
                <button
                  type="button"
                  data-tool-btn="true"
                  aria-label="Đóng Thước đo độ"
                  onClick={() => onUpdateTool('protractor', { enabled: false })}
                  className="p-0.5 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        }

        /* 4. Ê-KE VUÔNG (SET SQUARE) */
        if (tool.id === 'set_square') {
          const verts = computeSetSquareVertices(tool.x, tool.y, tool.lengthPx, tool.angleDeg);
          const legA = verts.legA;
          const legB = verts.legB;
          const midX = (verts.rightAngle.x + legA.x + legB.x) / 3;
          const midY = (verts.rightAngle.y + legA.y + legB.y) / 3;
          return (
            <div key="set_square" data-testid="active-tool-set_square" className="contents">
              <svg className="pointer-events-none absolute inset-0 w-full h-full">
                <polygon
                  points={`${verts.rightAngle.x},${verts.rightAngle.y} ${legA.x},${legA.y} ${legB.x},${legB.y}`}
                  fill="rgba(16, 185, 129, 0.22)"
                  stroke="#34D399"
                  strokeWidth={2.2}
                  strokeLinejoin="round"
                  className="pointer-events-auto cursor-grab active:cursor-grabbing touch-none"
                  onPointerDown={(e) => startDrag(e, tool, 'move')}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                />
              </svg>

              {/* Rotate/resize handle on legB */}
              <div
                onPointerDown={(e) => startDrag(e, tool, 'set_square_rotate')}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                style={{ transform: `translate3d(${legB.x - 12}px, ${legB.y - 12}px, 0)` }}
                title="Xoay & chỉnh cỡ Ê-ke"
                className="pointer-events-auto absolute top-0 left-0 w-6 h-6 rounded-full bg-emerald-400 border-2 border-slate-900 text-slate-950 flex items-center justify-center cursor-ew-resize touch-none shadow"
              >
                <RotateCw className="w-3 h-3" />
              </div>

              {/* Control badge inside triangle */}
              <div
                style={{ transform: `translate3d(${midX - 54}px, ${midY - 12}px, 0)` }}
                className="pointer-events-auto absolute top-0 left-0 px-2 py-0.5 rounded-lg bg-slate-900/92 border border-emerald-400/40 text-slate-100 text-[10px] flex items-center gap-1.5 shadow"
              >
                <span className="font-mono text-emerald-300">90°</span>
                <button
                  type="button"
                  data-tool-btn="true"
                  onClick={() =>
                    onCommitPoints(
                      [legA, verts.rightAngle, legB],
                      'Đã dựng góc vuông 90° bằng Ê-ke',
                      true
                    )
                  }
                  className="px-1.5 py-0.5 rounded bg-emerald-400 text-slate-950 font-semibold"
                >
                  Kẻ 90°
                </button>
                <button
                  type="button"
                  data-tool-btn="true"
                  aria-label="Đóng Ê-ke vuông"
                  onClick={() => onUpdateTool('set_square', { enabled: false })}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        }

        /* 5. THƯỚC ĐO KHOẢNG CÁCH AB (MEASURE TAPE) */
        if (tool.id === 'measure_tape') {
          const a = { x: tool.x, y: tool.y };
          const b = { x: tool.endX, y: tool.endY };
          const m = computeSegmentMeasurement(a, b);
          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2;

          return (
            <div key="measure_tape" data-testid="active-tool-measure_tape" className="contents">
              <svg className="pointer-events-none absolute inset-0 w-full h-full">
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#F472B6"
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                />
              </svg>

              {/* Pin A */}
              <div
                onPointerDown={(e) => startDrag(e, tool, 'tape_a')}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                style={{ transform: `translate3d(${a.x - 14}px, ${a.y - 14}px, 0)` }}
                className="pointer-events-auto absolute top-0 left-0 w-7 h-7 rounded-full bg-pink-500 border-2 border-white text-white text-xs font-bold flex items-center justify-center cursor-grab touch-none shadow-lg"
              >
                A
              </div>

              {/* Pin B */}
              <div
                onPointerDown={(e) => startDrag(e, tool, 'tape_b')}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                style={{ transform: `translate3d(${b.x - 14}px, ${b.y - 14}px, 0)` }}
                className="pointer-events-auto absolute top-0 left-0 w-7 h-7 rounded-full bg-pink-500 border-2 border-white text-white text-xs font-bold flex items-center justify-center cursor-grab touch-none shadow-lg"
              >
                B
              </div>

              {/* Readout pill */}
              <div
                style={{ transform: `translate3d(${midX - 88}px, ${midY - 34}px, 0)` }}
                className="pointer-events-auto absolute top-0 left-0 px-2.5 py-1 rounded-xl bg-slate-900/95 border border-pink-400/50 text-slate-100 text-[11px] flex items-center gap-2 shadow-xl"
              >
                <span className="font-mono font-semibold text-pink-300">
                  {m.cm} cm · {m.angleDeg}°
                </span>
                <button
                  type="button"
                  data-tool-btn="true"
                  onClick={() => onCommitPoints([a, b], `Đã nối đoạn AB = ${m.cm} cm`, true)}
                  className="px-1.5 py-0.5 rounded bg-pink-400 text-slate-950 font-semibold"
                >
                  Nối AB
                </button>
                <button
                  type="button"
                  data-tool-btn="true"
                  aria-label="Đóng Thước đo AB"
                  onClick={() => onUpdateTool('measure_tape', { enabled: false })}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        }

        /* 6. KHUÔN PARABOL (PARABOLA RULER) */
        if (tool.id === 'parabola_ruler') {
          const pts = computeParabolaPoints(
            tool.x,
            tool.y,
            tool.angleDeg,
            tool.parabolaA,
            tool.radiusPx
          );
          const pathD = pts.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
          const rotHandle = pts[pts.length - 1];

          return (
            <div key="parabola_ruler" data-testid="active-tool-parabola_ruler" className="contents">
              <svg className="pointer-events-none absolute inset-0 w-full h-full">
                <path
                  d={pathD}
                  fill="none"
                  stroke="#A78BFA"
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeDasharray="6 4"
                />
              </svg>

              {/* Vertex handle */}
              <div
                onPointerDown={(e) => startDrag(e, tool, 'move')}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                style={{ transform: `translate3d(${tool.x - 14}px, ${tool.y - 14}px, 0)` }}
                title="Kéo đỉnh Parabol"
                className="pointer-events-auto absolute top-0 left-0 w-7 h-7 rounded-full bg-violet-500 border-2 border-white text-white text-[10px] font-bold flex items-center justify-center cursor-grab touch-none shadow-lg"
              >
                P
              </div>

              {/* Rotate handle */}
              <div
                onPointerDown={(e) => startDrag(e, tool, 'parabola_rotate')}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                style={{ transform: `translate3d(${rotHandle.x - 12}px, ${rotHandle.y - 12}px, 0)` }}
                title="Xoay khuôn Parabol"
                className="pointer-events-auto absolute top-0 left-0 w-6 h-6 rounded-full bg-violet-300 border-2 border-slate-900 text-slate-950 flex items-center justify-center cursor-grab touch-none shadow"
              >
                <RotateCw className="w-3 h-3" />
              </div>

              {/* Control bar */}
              <div
                style={{ transform: `translate3d(${tool.x - 115}px, ${tool.y + 20}px, 0)` }}
                className="pointer-events-auto absolute top-0 left-0 px-2.5 py-1 rounded-xl bg-slate-900/95 border border-violet-400/40 text-slate-100 text-[11px] flex items-center gap-1.5 shadow-xl"
              >
                <span className="font-mono text-violet-300">a={tool.parabolaA}</span>
                {[0.3, 0.55, 1.0].map((val) => (
                  <button
                    key={val}
                    type="button"
                    data-tool-btn="true"
                    onClick={() => onUpdateTool('parabola_ruler', { parabolaA: val })}
                    className={`px-1.5 py-0.5 rounded text-[10px] ${
                      Math.abs(tool.parabolaA - val) < 0.05
                        ? 'bg-violet-400 text-slate-950 font-semibold'
                        : 'bg-white/10 text-slate-200'
                    }`}
                  >
                    {val}
                  </button>
                ))}
                <button
                  type="button"
                  data-tool-btn="true"
                  onClick={() =>
                    onCommitPoints(pts, `Đã vẽ đường cong Parabol y = ${tool.parabolaA}x²`)
                  }
                  className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-semibold"
                >
                  Vẽ
                </button>
                <button
                  type="button"
                  data-tool-btn="true"
                  aria-label="Đóng Khuôn Parabol"
                  onClick={() => onUpdateTool('parabola_ruler', { enabled: false })}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        }

        /* 7. KÍNH LÚP QUANG HỌC (OPTICAL MAGNIFIER) */
        if (tool.id === 'magnifier') {
          const size = 176;
          return (
            <div
              key="magnifier"
              data-testid="active-tool-magnifier"
              onPointerDown={(e) => startDrag(e, tool, 'move')}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              style={{
                width: size,
                height: size,
                transform: `translate3d(${tool.x - size / 2}px, ${tool.y - size / 2}px, 0)`,
              }}
              className="pointer-events-auto absolute top-0 left-0 rounded-full border-4 border-amber-400 shadow-2xl cursor-grab active:cursor-grabbing touch-none select-none"
            >
              <canvas
                ref={magnifierCanvasRef}
                className="w-full h-full rounded-full pointer-events-none"
              />
              {/* Subtle optical crosshair */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-4 h-px bg-amber-300/60" />
                <div className="h-4 w-px bg-amber-300/60 -ml-2" />
              </div>

              {/* Bottom zoom bar */}
              <div className="absolute -bottom-9 left-1/2 -translate-x-1/2 px-2 py-1 rounded-xl bg-slate-900/95 border border-amber-400/40 text-slate-100 text-[10px] flex items-center gap-1.5 shadow-xl whitespace-nowrap">
                <Search className="w-3 h-3 text-amber-300" />
                {[1.8, 2.2, 3.0].map((z) => (
                  <button
                    key={z}
                    type="button"
                    data-tool-btn="true"
                    onClick={() => onUpdateTool('magnifier', { zoom: z })}
                    className={`px-1.5 py-0.5 rounded font-mono ${
                      Math.abs(tool.zoom - z) < 0.1
                        ? 'bg-amber-400 text-slate-950 font-bold'
                        : 'bg-white/10 text-slate-300'
                    }`}
                  >
                    {z}×
                  </button>
                ))}
                <button
                  type="button"
                  data-tool-btn="true"
                  aria-label="Đóng Kính lúp"
                  onClick={() => onUpdateTool('magnifier', { enabled: false })}
                  className="text-slate-400 hover:text-white ml-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        }

        /* 8. ĐỒNG HỒ BẤM GIỜ & ĐẾM NGƯỢC (STUDY TIMER) */
        if (tool.id === 'timer') {
          const isFinished = tool.timerMode === 'countdown' && tool.timerSeconds === 0;
          return (
            <div
              key="timer"
              data-testid="active-tool-timer"
              onPointerDown={(e) => startDrag(e, tool, 'move')}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              style={{ transform: `translate3d(${tool.x}px, ${tool.y}px, 0)` }}
              className={`pointer-events-auto absolute top-0 left-0 w-52 rounded-2xl border shadow-2xl p-3 cursor-grab active:cursor-grabbing touch-none select-none backdrop-blur-md ${
                isFinished
                  ? 'bg-rose-950/92 border-rose-400 text-rose-100'
                  : 'bg-slate-900/95 border-white/15 text-slate-100'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    data-tool-btn="true"
                    onClick={() =>
                      onUpdateTool('timer', {
                        timerMode: 'countdown',
                        timerSeconds: tool.timerDurationSec,
                        timerRunning: false,
                      })
                    }
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      tool.timerMode === 'countdown'
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-white/10 text-slate-300'
                    }`}
                  >
                    Đếm ngược
                  </button>
                  <button
                    type="button"
                    data-tool-btn="true"
                    onClick={() =>
                      onUpdateTool('timer', {
                        timerMode: 'stopwatch',
                        timerSeconds: 0,
                        timerRunning: false,
                      })
                    }
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      tool.timerMode === 'stopwatch'
                        ? 'bg-sky-400 text-slate-950'
                        : 'bg-white/10 text-slate-300'
                    }`}
                  >
                    Bấm giờ
                  </button>
                </div>
                <button
                  type="button"
                  data-tool-btn="true"
                  aria-label="Đóng Đồng hồ"
                  onClick={() => onUpdateTool('timer', { enabled: false, timerRunning: false })}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="text-center font-mono text-3xl font-bold tracking-wider tabular-nums py-1">
                {formatTimerClock(tool.timerSeconds)}
              </div>

              {tool.timerMode === 'countdown' && (
                <div className="flex items-center justify-center gap-1 mt-1 mb-2">
                  {[60, 180, 300, 600].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      data-tool-btn="true"
                      onClick={() =>
                        onUpdateTool('timer', {
                          timerDurationSec: sec,
                          timerSeconds: sec,
                          timerRunning: false,
                        })
                      }
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                        tool.timerDurationSec === sec
                          ? 'bg-white/25 text-white font-semibold'
                          : 'bg-white/8 text-slate-300'
                      }`}
                    >
                      {sec / 60}p
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-1.5 mt-2">
                <button
                  type="button"
                  data-tool-btn="true"
                  onClick={() => onUpdateTool('timer', { timerRunning: !tool.timerRunning })}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 ${
                    tool.timerRunning
                      ? 'bg-amber-400 text-slate-950'
                      : 'bg-emerald-500 text-slate-950'
                  }`}
                >
                  {tool.timerRunning ? (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      <span>Tạm dừng</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span>{isFinished ? 'Hết giờ' : 'Bắt đầu'}</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  data-tool-btn="true"
                  aria-label="Đặt lại đồng hồ"
                  onClick={() =>
                    onUpdateTool('timer', {
                      timerSeconds: tool.timerMode === 'countdown' ? tool.timerDurationSec : 0,
                      timerRunning: false,
                    })
                  }
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/18 text-slate-200"
                >
                  {isFinished ? <Check className="w-3.5 h-3.5" /> : <RotateCcw className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
};
