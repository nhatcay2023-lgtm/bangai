import React, { useEffect, useRef, useState } from 'react';
import { GripHorizontal, Maximize2, Trash2 } from 'lucide-react';
import { resolveColorForTheme } from '../constants/boardTheme';
import type { BoardItem, BoardTheme, Point } from '../types/board';
import { clampBoardItemBox, computePinchItemBox, type ItemBox } from '../utils/boardGeometry';
import { DiagramRenderer } from './DiagramRenderer';

interface BoardItemCardProps {
  item: BoardItem;
  theme: BoardTheme;
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

export const BoardItemCard: React.FC<BoardItemCardProps> = ({
  item,
  theme,
  isSelected,
  boardSize,
  stageRef,
  onSelect,
  onUpdate,
  onDelete,
}) => {
  const isLight = theme === 'paper';
  const resolvedAccent = resolveColorForTheme(item.color, theme);

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

  // Sync liveBoxRef when React props update externally (undo/redo/sync) while idle
  useEffect(() => {
    if (!gestureRef.current) {
      liveBoxRef.current = {
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
      };
      if (cardRef.current) {
        cardRef.current.style.transform = `translate3d(${item.x}px, ${item.y}px, 0)`;
        cardRef.current.style.width = `${item.width}px`;
        cardRef.current.style.height = `${item.height}px`;
      }
    }
  }, [item.x, item.y, item.width, item.height]);

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
    if (cardRef.current) {
      cardRef.current.style.transform = `translate3d(${box.x}px, ${box.y}px, 0)`;
      cardRef.current.style.width = `${box.width}px`;
      cardRef.current.style.height = `${box.height}px`;
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

  const handleCardPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
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

  const handleCardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    const pt = toStagePoint(e.clientX, e.clientY);
    pointersRef.current.set(e.pointerId, pt);

    const g = gestureRef.current;
    if (!g) return;

    if (g.mode === 'move' && g.pointerId === e.pointerId) {
      const dx = pt.x - g.startPt.x;
      const dy = pt.y - g.startPt.y;
      liveBoxRef.current = clampBoardItemBox(
        {
          ...g.origBox,
          x: g.origBox.x + dx,
          y: g.origBox.y + dy,
        },
        boardSize.width,
        boardSize.height
      );
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
        boardSize.height
      );
      scheduleDomSync();
    }
  };

  const handleCardPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
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
      // Transition cleanly from two-finger pinch back to single-finger drag without jump
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
    liveBoxRef.current = clampBoardItemBox(
      {
        x: g.origBox.x,
        y: g.origBox.y,
        width: g.origBox.width + dx,
        height: g.origBox.height + dy,
      },
      boardSize.width,
      boardSize.height
    );
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
        boardSize.height
      );
      liveBoxRef.current = next;
      applyBoxToDom(next);
      onUpdate(item.id, next);
    };
    el.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => el.removeEventListener('wheel', onNativeWheel);
  }, [boardSize.height, boardSize.width, item.id, onUpdate]);

  return (
    <div
      ref={cardRef}
      data-testid={`board-item-${item.id}`}
      onPointerDown={handleCardPointerDown}
      onPointerMove={handleCardPointerMove}
      onPointerUp={handleCardPointerUp}
      onPointerCancel={handleCardPointerUp}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(item.id);
      }}
      className={`absolute top-0 left-0 rounded-xl flex flex-col overflow-hidden touch-none select-none ${
        activeMode === 'move' ? 'cursor-grabbing' : 'cursor-grab'
      } ${
        isLight
          ? 'bg-white/95 text-slate-900 shadow-md'
          : 'bg-slate-900/75 text-slate-50 shadow-lg backdrop-blur-sm'
      }`}
      style={{
        transform: `translate3d(${item.x}px, ${item.y}px, 0)`,
        willChange: 'transform',
        width: item.width,
        height: item.height,
        border: `2px solid ${resolvedAccent}`,
        boxShadow:
          activeMode || isSelected ? `0 0 0 3px ${resolvedAccent}55` : undefined,
        zIndex: activeMode || isSelected ? 18 : 12,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between gap-2 px-2.5 py-1.5 shrink-0"
        style={{ backgroundColor: `${resolvedAccent}24` }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <GripHorizontal className="w-3.5 h-3.5 shrink-0 opacity-75" />
          <span className="text-xs font-semibold truncate">{item.title}</span>
        </div>
        <button
          type="button"
          data-no-item-drag="true"
          aria-label={`Xóa "${item.title}" khỏi bảng`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(item.id);
          }}
          className="p-1 rounded hover:bg-rose-500/20 text-current opacity-75 hover:opacity-100 transition-opacity cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 p-2 overflow-hidden flex flex-col justify-center">
        {item.kind === 'diagram' && item.diagram ? (
          <DiagramRenderer
            diagram={item.diagram}
            theme={theme}
            width={Math.max(140, item.width - 16)}
            height={Math.max(90, item.height - 46)}
          />
        ) : (
          <p className="font-serif text-sm leading-relaxed overflow-y-auto thin-scrollbar px-1">
            {item.content}
          </p>
        )}
      </div>

      {/* Bottom caption / live size during pinch or resize */}
      <div className="flex items-center justify-between px-2.5 pb-1.5 pt-0.5 text-[11px] opacity-80 shrink-0">
        <span className="truncate pr-2 font-mono tabular-nums">
          {activeMode === 'pinch' || activeMode === 'resize' ? (
            <span ref={sizeLabelRef}>
              {item.width}×{item.height}
            </span>
          ) : (
            item.diagram?.caption || ''
          )}
        </span>
        <button
          type="button"
          data-no-item-drag="true"
          aria-label={`Thay đổi kích thước "${item.title}"`}
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          onPointerCancel={handleResizePointerUp}
          className="p-0.5 cursor-nwse-resize opacity-70 hover:opacity-100 touch-none"
        >
          <Maximize2 className="w-3 h-3 rotate-90" />
        </button>
      </div>
    </div>
  );
};
