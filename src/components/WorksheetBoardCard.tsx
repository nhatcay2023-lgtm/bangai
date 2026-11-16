import React, { useEffect, useRef, useState } from 'react';
import { GripHorizontal, Hand, Maximize2, Pencil, Trash2 } from 'lucide-react';
import { BOARD_THEMES, resolveColorForTheme } from '../constants/boardTheme';
import type { BoardItem, BoardTheme, DrawingTool, Point } from '../types/board';
import { clampBoardItemBox, computePinchItemBox, type ItemBox } from '../utils/boardGeometry';
import {
  computeWorksheetScale,
  WORKSHEET_MAX_HEIGHT,
  WORKSHEET_MAX_WIDTH,
  WORKSHEET_MIN_HEIGHT,
  WORKSHEET_MIN_WIDTH,
} from '../utils/worksheetGeometry';

interface WorksheetBoardCardProps {
  item: BoardItem;
  theme: BoardTheme;
  activeTool: DrawingTool;
  isSelected: boolean;
  boardSize: { width: number; height: number };
  stageRef: React.RefObject<HTMLDivElement | null>;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<BoardItem>) => void;
  onDelete: (id: string) => void;
}

type GestureState =
  | {
      mode: 'move';
      pointerId: number;
      startPt: Point;
      origBox: ItemBox;
    }
  | {
      mode: 'pinch';
      id1: number;
      id2: number;
      p1Start: Point;
      p2Start: Point;
      origBox: ItemBox;
    }
  | {
      mode: 'resize';
      pointerId: number;
      startPt: Point;
      origBox: ItemBox;
    };

export const WorksheetBoardCard: React.FC<WorksheetBoardCardProps> = ({
  item,
  theme,
  activeTool,
  isSelected,
  boardSize,
  stageRef,
  onSelect,
  onUpdate,
  onDelete,
}) => {
  const worksheet = item.worksheet;
  const isLight = BOARD_THEMES[theme].isLight;
  const inkColor = isLight ? '#0F172A' : '#FFFDF7';
  const accentColor = resolveColorForTheme(item.color || '#FDE047', theme);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const sizeLabelRef = useRef<HTMLSpanElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const pointersRef = useRef<Map<number, Point>>(new Map());
  const gestureRef = useRef<GestureState | null>(null);
  const liveBoxRef = useRef<ItemBox>({
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
  });

  const [activeMode, setActiveMode] = useState<'move' | 'pinch' | 'resize' | null>(null);
  const [bodyDragLocked, setBodyDragLocked] = useState(false);

  const canDragBody = activeTool === 'select' || bodyDragLocked;
  const initialScale = worksheet
    ? computeWorksheetScale(item.width, item.height, worksheet)
    : 1;

  useEffect(() => {
    if (!gestureRef.current) {
      liveBoxRef.current = {
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
      };
      if (cardRef.current && worksheet) {
        const s = computeWorksheetScale(item.width, item.height, worksheet);
        cardRef.current.style.transform = `translate3d(${item.x}px, ${item.y}px, 0)`;
        cardRef.current.style.width = `${item.width}px`;
        cardRef.current.style.height = `${item.height}px`;
        cardRef.current.style.setProperty('--ws-scale', String(s));
      }
    }
  }, [item.x, item.y, item.width, item.height, worksheet]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const toStagePoint = (clientX: number, clientY: number): Point => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: clientX, y: clientY };
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const applyBoxToDom = (box: ItemBox) => {
    if (cardRef.current && worksheet) {
      const nextScale = computeWorksheetScale(box.width, box.height, worksheet);
      cardRef.current.style.transform = `translate3d(${box.x}px, ${box.y}px, 0)`;
      cardRef.current.style.width = `${box.width}px`;
      cardRef.current.style.height = `${box.height}px`;
      cardRef.current.style.setProperty('--ws-scale', String(nextScale));
    }
    if (sizeLabelRef.current) {
      sizeLabelRef.current.textContent = `${box.width}×${box.height}`;
    }
  };

  const scheduleDomSync = () => {
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        applyBoxToDom(liveBoxRef.current);
      });
    }
  };

  const commitLiveBox = () => {
    const finalBox = liveBoxRef.current;
    if (
      finalBox.x !== item.x ||
      finalBox.y !== item.y ||
      finalBox.width !== item.width ||
      finalBox.height !== item.height
    ) {
      onUpdate(item.id, finalBox);
    }
  };

  const clampWorksheetBox = (box: ItemBox): ItemBox =>
    clampBoardItemBox(
      box,
      boardSize.width,
      boardSize.height,
      WORKSHEET_MIN_WIDTH,
      WORKSHEET_MIN_HEIGHT,
      WORKSHEET_MAX_WIDTH,
      WORKSHEET_MAX_HEIGHT,
      8
    );

  const handleMovePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-item-drag="true"]')) return;

    e.stopPropagation();
    onSelect(item.id);

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore if capture unavailable
    }

    const pt = toStagePoint(e.clientX, e.clientY);
    pointersRef.current.set(e.pointerId, pt);

    if (pointersRef.current.size === 1) {
      gestureRef.current = {
        mode: 'move',
        pointerId: e.pointerId,
        startPt: pt,
        origBox: { ...liveBoxRef.current },
      };
      setActiveMode('move');
    } else if (pointersRef.current.size >= 2) {
      const entries = Array.from(pointersRef.current.entries());
      const [id1, p1Start] = entries[0];
      const [id2, p2Start] = entries[1];
      gestureRef.current = {
        mode: 'pinch',
        id1,
        id2,
        p1Start: { ...p1Start },
        p2Start: { ...p2Start },
        origBox: { ...liveBoxRef.current },
      };
      setActiveMode('pinch');
    }
  };

  const handleMovePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    const pt = toStagePoint(e.clientX, e.clientY);
    pointersRef.current.set(e.pointerId, pt);

    const g = gestureRef.current;
    if (!g) return;

    if (g.mode === 'move' && g.pointerId === e.pointerId) {
      const dx = pt.x - g.startPt.x;
      const dy = pt.y - g.startPt.y;
      liveBoxRef.current = clampWorksheetBox({
        ...g.origBox,
        x: g.origBox.x + dx,
        y: g.origBox.y + dy,
      });
      scheduleDomSync();
    } else if (g.mode === 'pinch') {
      const p1Curr = pointersRef.current.get(g.id1);
      const p2Curr = pointersRef.current.get(g.id2);
      if (!p1Curr || !p2Curr) return;
      liveBoxRef.current = computePinchItemBox(
        g.origBox,
        g.p1Start,
        g.p2Start,
        p1Curr,
        p2Curr,
        boardSize.width,
        boardSize.height,
        WORKSHEET_MIN_WIDTH,
        WORKSHEET_MIN_HEIGHT,
        WORKSHEET_MAX_WIDTH,
        WORKSHEET_MAX_HEIGHT,
        8
      );
      scheduleDomSync();
    }
  };

  const handleMovePointerUp = (e: React.PointerEvent<HTMLElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.delete(e.pointerId);

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }

    if (pointersRef.current.size === 1) {
      const [remId, remPt] = Array.from(pointersRef.current.entries())[0];
      gestureRef.current = {
        mode: 'move',
        pointerId: remId,
        startPt: { ...remPt },
        origBox: { ...liveBoxRef.current },
      };
      setActiveMode('move');
      return;
    }

    if (pointersRef.current.size === 0 && gestureRef.current && gestureRef.current.mode !== 'resize') {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      applyBoxToDom(liveBoxRef.current);
      gestureRef.current = null;
      setActiveMode(null);
      commitLiveBox();
    }
  };

  const handleResizePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.stopPropagation();
    onSelect(item.id);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const pt = toStagePoint(e.clientX, e.clientY);
    gestureRef.current = {
      mode: 'resize',
      pointerId: e.pointerId,
      startPt: pt,
      origBox: { ...liveBoxRef.current },
    };
    setActiveMode('resize');
  };

  const handleResizePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const g = gestureRef.current;
    if (!g || g.mode !== 'resize' || g.pointerId !== e.pointerId) return;
    const pt = toStagePoint(e.clientX, e.clientY);
    const dx = pt.x - g.startPt.x;
    const dy = pt.y - g.startPt.y;
    liveBoxRef.current = clampWorksheetBox({
      x: g.origBox.x,
      y: g.origBox.y,
      width: g.origBox.width + dx,
      height: g.origBox.height + dy,
    });
    scheduleDomSync();
  };

  const handleResizePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const g = gestureRef.current;
    if (!g || g.mode !== 'resize' || g.pointerId !== e.pointerId) return;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    applyBoxToDom(liveBoxRef.current);
    gestureRef.current = null;
    setActiveMode(null);
    commitLiveBox();
  };

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const onNativeWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();
      const scale = Math.exp(-e.deltaY * 0.006);
      const pt = toStagePoint(e.clientX, e.clientY);
      const cur = liveBoxRef.current;
      const relX = pt.x - cur.x;
      const relY = pt.y - cur.y;
      const next = clampBoardItemBox(
        {
          x: pt.x - relX * scale,
          y: pt.y - relY * scale,
          width: cur.width * scale,
          height: cur.height * scale,
        },
        boardSize.width,
        boardSize.height,
        WORKSHEET_MIN_WIDTH,
        WORKSHEET_MIN_HEIGHT,
        WORKSHEET_MAX_WIDTH,
        WORKSHEET_MAX_HEIGHT,
        8
      );
      liveBoxRef.current = next;
      applyBoxToDom(next);
      onUpdate(item.id, next);
    };
    el.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => el.removeEventListener('wheel', onNativeWheel);
  }, [boardSize.height, boardSize.width, item.id, onUpdate]);

  if (!worksheet) return null;

  return (
    <div
      ref={cardRef}
      data-testid={`worksheet-card-${item.id}`}
      data-transparent-bg="true"
      onPointerDown={canDragBody ? handleMovePointerDown : undefined}
      onPointerMove={canDragBody ? handleMovePointerMove : undefined}
      onPointerUp={canDragBody ? handleMovePointerUp : undefined}
      onPointerCancel={canDragBody ? handleMovePointerUp : undefined}
      style={
        {
          transform: `translate3d(${item.x}px, ${item.y}px, 0)`,
          willChange: 'transform',
          width: item.width,
          height: item.height,
          '--ws-scale': String(initialScale),
          zIndex: activeMode || isSelected ? 8 : 6,
          backgroundColor: 'transparent',
          border: `1.5px dashed ${
            activeMode || isSelected || bodyDragLocked
              ? accentColor
              : isLight
                ? 'rgba(15, 23, 42, 0.25)'
                : 'rgba(248, 250, 252, 0.24)'
          }`,
        } as React.CSSProperties
      }
      className={`group absolute top-0 left-0 rounded-xl flex flex-col select-none bg-transparent ${
        canDragBody
          ? `pointer-events-auto touch-none ${
              activeMode === 'move' ? 'cursor-grabbing' : 'cursor-grab'
            }`
          : 'pointer-events-none'
      }`}
    >
      {/* Top Drag Handle & Mode Controls (Always interactive without blocking writing below) */}
      <div
        data-testid={`worksheet-drag-handle-${item.id}`}
        onPointerDown={handleMovePointerDown}
        onPointerMove={handleMovePointerMove}
        onPointerUp={handleMovePointerUp}
        onPointerCancel={handleMovePointerUp}
        className={`pointer-events-auto touch-none flex items-center justify-between gap-2 px-2.5 py-1 rounded-t-[10px] border-b transition-colors shrink-0 ${
          activeMode === 'move' ? 'cursor-grabbing' : 'cursor-grab'
        } ${
          isLight
            ? 'bg-slate-900/8 border-slate-900/12 text-slate-800'
            : 'bg-slate-950/35 border-white/10 text-slate-100'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <GripHorizontal className="w-3.5 h-3.5 shrink-0 opacity-80" style={{ color: accentColor }} />
          <span className="text-[11px] font-bold truncate" style={{ color: accentColor }}>
            Bài {worksheet.number}: {worksheet.title}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0" data-no-item-drag="true">
          <button
            type="button"
            data-testid={`worksheet-toggle-drag-${item.id}`}
            aria-pressed={bodyDragLocked}
            aria-label={
              bodyDragLocked
                ? `Chuyển sang chế độ viết lên Bài ${worksheet.number}`
                : `Chuyển sang chế độ kéo toàn khung Bài ${worksheet.number}`
            }
            onClick={(e) => {
              e.stopPropagation();
              setBodyDragLocked((prev) => !prev);
            }}
            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
              canDragBody
                ? 'bg-amber-400 text-slate-950'
                : isLight
                  ? 'bg-slate-900/10 text-slate-700 hover:bg-slate-900/20'
                  : 'bg-white/12 text-slate-200 hover:bg-white/22'
            }`}
          >
            {canDragBody ? <Hand className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
            <span>{canDragBody ? 'Đang kéo' : 'Viết lên'}</span>
          </button>

          <button
            type="button"
            data-testid={`worksheet-delete-${item.id}`}
            aria-label={`Xóa "${item.title}" khỏi bảng`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item.id);
            }}
            className="p-1 rounded hover:bg-rose-500/25 text-current opacity-75 hover:opacity-100 transition-opacity cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Transparent Math Exercise Body (chalk strokes canvas renders visually ON TOP) */}
      <div
        className="flex-1 min-h-0 flex flex-col justify-between overflow-hidden"
        style={{
          padding: 'calc(10px * var(--ws-scale, 1)) calc(14px * var(--ws-scale, 1))',
          color: inkColor,
          textShadow: isLight ? 'none' : '0 1px 2px rgba(0, 0, 0, 0.55)',
        }}
      >
        <div>
          <div
            className="font-semibold tracking-tight opacity-95"
            style={{
              fontSize: 'calc(13px * var(--ws-scale, 1))',
              color: accentColor,
              marginBottom: 'calc(8px * var(--ws-scale, 1))',
            }}
          >
            {worksheet.instruction}
          </div>

          {worksheet.layout === 'vertical' ? (
            <div
              className="grid grid-cols-4 items-start"
              style={{ gap: 'calc(10px * var(--ws-scale, 1))' }}
            >
              {worksheet.problems.map((p) => (
                <div
                  key={p.id}
                  className="font-mono font-bold tabular-nums leading-tight flex flex-col items-end pr-2"
                  style={{ fontSize: 'calc(20px * var(--ws-scale, 1))' }}
                >
                  <div>{p.top}</div>
                  <div className="relative w-full text-right">
                    <span className="mr-1 opacity-90">{p.op}</span>
                    <span>{p.bottom}</span>
                  </div>
                  <div
                    className="w-full mt-1"
                    style={{
                      borderTop: `2px solid ${inkColor}`,
                      height: 'calc(32px * var(--ws-scale, 1))',
                    }}
                  />
                </div>
              ))}
            </div>
          ) : worksheet.layout === 'word_problem' ? (
            <div
              className="font-sans font-medium leading-relaxed flex flex-col"
              style={{
                fontSize: 'calc(14px * var(--ws-scale, 1))',
                gap: 'calc(6px * var(--ws-scale, 1))',
              }}
            >
              {worksheet.problems.map((p) => (
                <div key={p.id} className="whitespace-pre-wrap">
                  {p.text}
                </div>
              ))}
            </div>
          ) : (
            <div
              className={`grid ${worksheet.columns === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}
              style={{
                columnGap: 'calc(18px * var(--ws-scale, 1))',
                rowGap: 'calc(12px * var(--ws-scale, 1))',
              }}
            >
              {worksheet.problems.map((p) => (
                <div
                  key={p.id}
                  className="font-mono font-bold tabular-nums tracking-wide whitespace-nowrap"
                  style={{ fontSize: 'calc(17px * var(--ws-scale, 1))' }}
                >
                  {p.text}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Resize Handle & Live Size Badge */}
      <div className="flex items-center justify-between px-2 pb-1 pt-0.5 text-[10px] shrink-0">
        <span
          className="font-mono tabular-nums opacity-75"
          style={{ color: accentColor }}
        >
          {activeMode === 'pinch' || activeMode === 'resize' ? (
            <span ref={sizeLabelRef}>
              {item.width}×{item.height}
            </span>
          ) : (
            'Nền trong suốt • Viết trực tiếp lên trên'
          )}
        </span>

        <button
          type="button"
          data-testid={`worksheet-resize-${item.id}`}
          data-no-item-drag="true"
          aria-label={`Kéo to nhỏ Bài ${worksheet.number} ${worksheet.title}`}
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          onPointerCancel={handleResizePointerUp}
          className="pointer-events-auto p-1 rounded cursor-nwse-resize opacity-85 hover:opacity-100 touch-none"
          style={{ color: accentColor }}
        >
          <Maximize2 className="w-3.5 h-3.5 rotate-90" />
        </button>
      </div>
    </div>
  );
};
