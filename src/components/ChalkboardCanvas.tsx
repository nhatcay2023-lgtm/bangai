import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { BOARD_THEMES, resolveColorForTheme } from '../constants/boardTheme';
import type {
  BoardItem,
  BoardTheme,
  DiagramSpec,
  DrawingTool,
  Grade1ExerciseSpec,
  GridType,
  Point,
  Stroke,
} from '../types/board';
import type { ActiveStudyTool, StudyToolKind } from '../types/tools';
import { hitTestStroke, simplifyPoints } from '../utils/boardGeometry';
import { snapPointToStraightedges } from '../utils/studyToolsGeometry';
import { BoardItemCard } from './BoardItemCard';
import { drawBoardItemToCanvas } from './DiagramRenderer';
import { StudyToolsOverlay } from './StudyToolsOverlay';
import { WorksheetBoardCard } from './WorksheetBoardCard';

export interface ChalkboardCanvasHandle {
  exportPng: (title: string) => string | null;
  captureSnapshotBase64: () => string | null;
}

interface ChalkboardCanvasProps {
  theme: BoardTheme;
  gridType: GridType;
  activeTool: DrawingTool;
  activeColor: string;
  strokeWidth: number;
  strokes: Stroke[];
  items: BoardItem[];
  onCommitStroke: (stroke: Stroke) => void;
  onEraseStrokes: (remainingStrokes: Stroke[]) => void;
  onDropDiagram: (diagram: DiagramSpec, x: number, y: number) => void;
  onDropWorksheet: (exercise: Grade1ExerciseSpec, x: number, y: number) => void;
  onDropNote: (title: string, content: string, color: string, x: number, y: number) => void;
  onUpdateItem: (id: string, patch: Partial<BoardItem>) => void;
  onDeleteItem: (id: string) => void;
  studyTools: ActiveStudyTool[];
  onUpdateStudyTool: (id: StudyToolKind, patch: Partial<ActiveStudyTool>) => void;
  onCommitToolPoints: (points: Point[], label?: string, sharpCorners?: boolean) => void;
}

function drawGridOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: BoardTheme,
  gridType: GridType
) {
  if (gridType === 'none') return;
  const style = BOARD_THEMES[theme];
  ctx.save();

  if (gridType === 'square') {
    const step = 36;
    ctx.strokeStyle = style.gridSubStroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = step / 2; x < width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = step / 2; y < height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    ctx.strokeStyle = style.gridStroke;
    ctx.beginPath();
    for (let x = step; x < width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = step; y < height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
  } else if (gridType === 'lined') {
    // Primary school 4-line handwriting notebook (Ô ly luyện chữ)
    const unit = 22;
    const groupH = unit * 4;
    for (let base = 40; base < height; base += groupH) {
      // Top & bottom bold lines of each writing row
      ctx.strokeStyle = style.gridStroke;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(0, base);
      ctx.lineTo(width, base);
      ctx.moveTo(0, base + unit * 3);
      ctx.lineTo(width, base + unit * 3);
      ctx.stroke();

      // Dotted inner guide lines
      ctx.strokeStyle = style.gridSubStroke;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, base + unit);
      ctx.lineTo(width, base + unit);
      ctx.moveTo(0, base + unit * 2);
      ctx.lineTo(width, base + unit * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Vertical helper columns
    ctx.strokeStyle = style.gridSubStroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = unit * 2; x < width; x += unit * 2) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    ctx.stroke();
  } else if (gridType === 'axes') {
    const step = 40;
    const cx = Math.round(width / 2 / step) * step;
    const cy = Math.round(height / 2 / step) * step;

    ctx.strokeStyle = style.gridSubStroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = cx % step; x < width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = cy % step; y < height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    // Main Oxy axes
    ctx.strokeStyle = style.axisStroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(width, cy);
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, height);
    ctx.stroke();

    // Axis ticks & labels
    ctx.fillStyle = style.axisStroke;
    ctx.font = '500 11px "JetBrains Mono", monospace';
    ctx.fillText('O', cx - 14, cy + 14);
    ctx.fillText('x', width - 18, cy - 8);
    ctx.fillText('y', cx + 10, 68);
  }

  ctx.restore();
}

function drawSingleStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, theme: BoardTheme) {
  const pts = stroke.points;
  if (pts.length === 0) return;

  const color = resolveColorForTheme(stroke.color, theme);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  if (stroke.tool === 'highlighter') {
    ctx.globalAlpha = 0.34;
    ctx.lineWidth = Math.max(12, stroke.width * 2.4);
  } else if (stroke.tool === 'chalk') {
    ctx.globalAlpha = 0.94;
    ctx.lineWidth = stroke.width;
    ctx.shadowColor = color;
    ctx.shadowBlur = Math.max(0.5, stroke.width * 0.25);
  } else {
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = stroke.width;
  }

  if (stroke.tool === 'line' && pts.length >= 2) {
    const start = pts[0];
    const end = pts[pts.length - 1];
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (stroke.tool === 'rect' && pts.length >= 2) {
    const p0 = pts[0];
    const p1 = pts[pts.length - 1];
    ctx.strokeRect(
      Math.min(p0.x, p1.x),
      Math.min(p0.y, p1.y),
      Math.abs(p1.x - p0.x),
      Math.abs(p1.y - p0.y)
    );
    ctx.restore();
    return;
  }

  if (stroke.tool === 'circle' && pts.length >= 2) {
    const p0 = pts[0];
    const p1 = pts[pts.length - 1];
    const r = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    ctx.beginPath();
    ctx.arc(p0.x, p0.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const midX = (pts[i].x + pts[i + 1].x) / 2;
    const midY = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
  ctx.restore();
}

export const ChalkboardCanvas = React.forwardRef<ChalkboardCanvasHandle, ChalkboardCanvasProps>(
  (
    {
      theme,
      gridType,
      activeTool,
      activeColor,
      strokeWidth,
      strokes,
      items,
      onCommitStroke,
      onEraseStrokes,
      onDropDiagram,
      onDropWorksheet,
      onDropNote,
      onUpdateItem,
      onDeleteItem,
      studyTools,
      onUpdateStudyTool,
      onCommitToolPoints,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const activeStrokeRef = useRef<Stroke | null>(null);
    const isDrawingRef = useRef(false);
    const strokesRef = useRef<Stroke[]>(strokes);
    strokesRef.current = strokes;

    const [eraserCursor, setEraserCursor] = useState<Point | null>(null);
    const [dragOverBoard, setDragOverBoard] = useState(false);
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [canvasSize, setCanvasSize] = useState({ width: 1440, height: 900 });

    const redrawGrid = useCallback(() => {
      const gridCanvas = gridCanvasRef.current;
      if (!gridCanvas) return;
      const ctx = gridCanvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const logicalW = gridCanvas.width / dpr;
      const logicalH = gridCanvas.height / dpr;

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, logicalW, logicalH);
      drawGridOverlay(ctx, logicalW, logicalH, theme, gridType);
      ctx.restore();
    }, [theme, gridType]);

    const redraw = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const logicalW = canvas.width / dpr;
      const logicalH = canvas.height / dpr;

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, logicalW, logicalH);

      for (const s of strokesRef.current) {
        drawSingleStroke(ctx, s, theme);
      }

      if (activeStrokeRef.current) {
        drawSingleStroke(ctx, activeStrokeRef.current, theme);
      }
      ctx.restore();
    }, [theme]);

    useEffect(() => {
      const el = containerRef.current;
      const gridCanvas = gridCanvasRef.current;
      const canvas = canvasRef.current;
      if (!el || !gridCanvas || !canvas) return;

      const syncSize = () => {
        const rect = el.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        gridCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
        gridCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
        canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        setCanvasSize({ width: rect.width, height: rect.height });
        redrawGrid();
        redraw();
      };

      syncSize();
      const observer = new ResizeObserver(syncSize);
      observer.observe(el);
      return () => observer.disconnect();
    }, [redraw, redrawGrid]);

    useEffect(() => {
      redrawGrid();
    }, [theme, gridType, redrawGrid]);

    useEffect(() => {
      redraw();
    }, [strokes, theme, redraw]);

    useImperativeHandle(
      ref,
      () => ({
        exportPng(title: string) {
          const canvas = canvasRef.current;
          if (!canvas) return null;
          const offscreen = document.createElement('canvas');
          const w = canvasSize.width;
          const h = canvasSize.height;
          offscreen.width = w;
          offscreen.height = h;
          const ctx = offscreen.getContext('2d');
          if (!ctx) return null;

          // 1. Solid board surface
          ctx.fillStyle = BOARD_THEMES[theme].bgHex;
          ctx.fillRect(0, 0, w, h);

          // 2. Grid
          drawGridOverlay(ctx, w, h, theme, gridType);

          // 3. Transparent worksheets sit under chalk strokes so student writing is on top
          for (const item of items) {
            if (item.kind === 'worksheet') {
              drawBoardItemToCanvas(ctx, item, theme);
            }
          }

          // 4. All strokes
          for (const s of strokesRef.current) {
            drawSingleStroke(ctx, s, theme);
          }

          // 5. Diagrams & highlighted note cards
          for (const item of items) {
            if (item.kind !== 'worksheet') {
              drawBoardItemToCanvas(ctx, item, theme);
            }
          }

          const dataUrl = offscreen.toDataURL('image/png');
          const safeTitle = title
            .toLowerCase()
            .replace(/[^a-z0-9\-]+/g, '-')
            .replace(/^-|-$/g, '');
          const link = document.createElement('a');
          link.download = `${safeTitle || 'bang-phan-ai'}.png`;
          link.href = dataUrl;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          return dataUrl;
        },
        captureSnapshotBase64() {
          const canvas = canvasRef.current;
          if (!canvas) return null;
          const offscreen = document.createElement('canvas');
          const scale = Math.min(1, 960 / Math.max(1, canvasSize.width));
          const w = Math.max(1, Math.round(canvasSize.width * scale));
          const h = Math.max(1, Math.round(canvasSize.height * scale));
          offscreen.width = w;
          offscreen.height = h;
          const ctx = offscreen.getContext('2d');
          if (!ctx) return null;
          ctx.fillStyle = BOARD_THEMES[theme].bgHex;
          ctx.fillRect(0, 0, w, h);
          ctx.scale(scale, scale);
          drawGridOverlay(ctx, canvasSize.width, canvasSize.height, theme, gridType);
          for (const item of items) {
            if (item.kind === 'worksheet') {
              drawBoardItemToCanvas(ctx, item, theme);
            }
          }
          for (const s of strokesRef.current) {
            drawSingleStroke(ctx, s, theme);
          }
          for (const item of items) {
            if (item.kind !== 'worksheet') {
              drawBoardItemToCanvas(ctx, item, theme);
            }
          }
          return offscreen.toDataURL('image/png');
        },
      }),
      [canvasSize, theme, gridType, items]
    );

    const getBoardPoint = (e: React.PointerEvent): Point => {
      const rect = canvasRef.current!.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const eraseAtPoint = (pt: Point) => {
      const radius = Math.max(14, strokeWidth * 2.6);
      const next = strokesRef.current.filter((s) => !hitTestStroke(s, pt, radius));
      if (next.length !== strokesRef.current.length) {
        onEraseStrokes(next);
      }
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      setSelectedItemId(null);
      if (activeTool === 'select') return;

      const rawPt = getBoardPoint(e);
      e.currentTarget.setPointerCapture(e.pointerId);
      isDrawingRef.current = true;

      if (activeTool === 'eraser') {
        setEraserCursor(rawPt);
        eraseAtPoint(rawPt);
        return;
      }

      const pt =
        activeTool === 'chalk' || activeTool === 'highlighter' || activeTool === 'line'
          ? snapPointToStraightedges(rawPt, studyTools).point
          : rawPt;

      activeStrokeRef.current = {
        id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tool: activeTool,
        color: activeColor,
        width: strokeWidth,
        opacity: activeTool === 'highlighter' ? 0.34 : 0.95,
        points: [pt],
      };
      redraw();
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      const rawPt = getBoardPoint(e);
      if (activeTool === 'eraser') {
        setEraserCursor(rawPt);
        if (isDrawingRef.current) {
          eraseAtPoint(rawPt);
        }
        return;
      }

      if (!isDrawingRef.current || !activeStrokeRef.current) return;

      const current = activeStrokeRef.current;
      const pt =
        current.tool === 'chalk' || current.tool === 'highlighter' || current.tool === 'line'
          ? snapPointToStraightedges(rawPt, studyTools).point
          : rawPt;

      if (current.tool === 'line' || current.tool === 'rect' || current.tool === 'circle') {
        current.points = [current.points[0], pt];
      } else {
        const last = current.points[current.points.length - 1];
        if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) >= 2.2) {
          current.points.push(pt);
        }
      }
      redraw();
    };

    const finishStroke = () => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;

      if (activeStrokeRef.current) {
        const raw = activeStrokeRef.current;
        const simplified =
          raw.tool === 'chalk' || raw.tool === 'highlighter'
            ? { ...raw, points: simplifyPoints(raw.points, 1.2) }
            : raw;
        activeStrokeRef.current = null;
        onCommitStroke(simplified);
      }
      redraw();
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      if (
        e.dataTransfer.types.includes('application/x-board-diagram') ||
        e.dataTransfer.types.includes('application/x-board-worksheet') ||
        e.dataTransfer.types.includes('application/x-board-note')
      ) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setDragOverBoard(true);
      }
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOverBoard(false);
      const rect = containerRef.current?.getBoundingClientRect();
      const x = rect ? e.clientX - rect.left - 120 : 200;
      const y = rect ? e.clientY - rect.top - 80 : 160;

      const diagramPayload = e.dataTransfer.getData('application/x-board-diagram');
      if (diagramPayload) {
        try {
          const diagram = JSON.parse(diagramPayload) as DiagramSpec;
          onDropDiagram(diagram, x, y);
          return;
        } catch {
          // ignore malformed drag payload
        }
      }

      const worksheetPayload = e.dataTransfer.getData('application/x-board-worksheet');
      if (worksheetPayload) {
        try {
          const exercise = JSON.parse(worksheetPayload) as Grade1ExerciseSpec;
          onDropWorksheet(exercise, x, y);
          return;
        } catch {
          // ignore malformed drag payload
        }
      }

      const notePayload = e.dataTransfer.getData('application/x-board-note');
      if (notePayload) {
        try {
          const note = JSON.parse(notePayload) as { title: string; content: string; color: string };
          onDropNote(note.title, note.content, note.color, x, y);
        } catch {
          // ignore malformed drag payload
        }
      }
    };

    const themeObj = BOARD_THEMES[theme];
    const eraserDiameter = Math.max(24, strokeWidth * 4.2);

    return (
      <div
        ref={containerRef}
        data-testid="chalkboard-stage"
        data-theme={theme}
        data-grid={gridType}
        data-stroke-count={strokes.length}
        data-item-count={items.length}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOverBoard(false)}
        onDrop={handleDrop}
        className={`relative w-full h-full overflow-hidden select-none transition-colors duration-300 ${
          themeObj.isLight ? 'paper-surface-texture' : 'chalk-surface-texture'
        }`}
        style={{
          backgroundColor: themeObj.bgHex,
          boxShadow: `inset 0 0 0 6px ${themeObj.frameHex}`,
        }}
      >
        {/* Grid layer (z-1, behind transparent worksheets) */}
        <canvas
          ref={gridCanvasRef}
          aria-hidden="true"
          className="absolute inset-0 w-full h-full pointer-events-none z-[1]"
        />

        {/* Drawing pointer capture layer (z-2, receives clicks/strokes passing through transparent worksheet bodies) */}
        <div
          data-testid="chalkboard-draw-surface"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onPointerLeave={() => setEraserCursor(null)}
          className={`absolute inset-0 w-full h-full touch-none z-[2] ${
            activeTool === 'eraser'
              ? 'cursor-none'
              : activeTool === 'select'
                ? 'cursor-default'
                : 'cursor-crosshair'
          }`}
        />

        {/* Transparent Grade 1 Math Worksheets (z-6, below chalk strokes layer so user can write on top) */}
        {items
          .filter((item) => item.kind === 'worksheet')
          .map((item) => (
            <WorksheetBoardCard
              key={item.id}
              item={item}
              theme={theme}
              activeTool={activeTool}
              isSelected={selectedItemId === item.id}
              boardSize={canvasSize}
              stageRef={containerRef}
              onSelect={setSelectedItemId}
              onUpdate={onUpdateItem}
              onDelete={onDeleteItem}
            />
          ))}

        {/* Chalk & Ink Strokes layer (z-10, visually ON TOP of transparent worksheets) */}
        <canvas
          ref={canvasRef}
          data-testid="chalkboard-canvas"
          className="absolute inset-0 w-full h-full pointer-events-none z-[10]"
        />

        {/* Drop target indicator when dragging from AI chat bubble */}
        {dragOverBoard && (
          <div className="pointer-events-none absolute inset-4 rounded-xl border-2 border-dashed border-amber-300/80 bg-amber-400/5 flex items-center justify-center z-20">
            <span className="px-4 py-2 rounded-lg bg-slate-900/90 text-amber-200 text-sm font-medium shadow-lg">
              Thả vào đây để ghim lên bảng
            </span>
          </div>
        )}

        {/* Eraser ring cursor */}
        {activeTool === 'eraser' && eraserCursor && (
          <div
            className="pointer-events-none absolute rounded-full border-2 z-[15]"
            style={{
              width: eraserDiameter,
              height: eraserDiameter,
              left: eraserCursor.x - eraserDiameter / 2,
              top: eraserCursor.y - eraserDiameter / 2,
              borderColor: themeObj.isLight ? 'rgba(15, 23, 42, 0.7)' : 'rgba(248, 250, 252, 0.8)',
              backgroundColor: themeObj.isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(248, 250, 252, 0.12)',
            }}
          />
        )}

        {/* Placed Interactive Diagrams & Highlighted Notes */}
        {items
          .filter((item) => item.kind !== 'worksheet')
          .map((item) => (
            <BoardItemCard
              key={item.id}
              item={item}
              theme={theme}
              isSelected={selectedItemId === item.id}
              boardSize={canvasSize}
              stageRef={containerRef}
              onSelect={setSelectedItemId}
              onUpdate={onUpdateItem}
              onDelete={onDeleteItem}
            />
          ))}

        {/* Interactive Classroom Study Tools Overlay (8 instruments) */}
        <StudyToolsOverlay
          tools={studyTools}
          theme={theme}
          stageRef={containerRef}
          canvasRef={canvasRef}
          strokesVersion={strokes.length}
          onUpdateTool={onUpdateStudyTool}
          onCommitPoints={onCommitToolPoints}
        />
      </div>
    );
  }
);

ChalkboardCanvas.displayName = 'ChalkboardCanvas';
