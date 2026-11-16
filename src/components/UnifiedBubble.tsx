import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Calculator,
  Cloud,
  Download,
  Eraser,
  Highlighter,
  Layers,
  Pencil,
  Pin,
  Redo2,
  Ruler,
  Shapes,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import {
  NOTE_HIGHLIGHT_COLORS,
  PRESET_DIAGRAMS,
  resolveColorForTheme,
} from '../constants/boardTheme';
import type {
  BoardTheme,
  ChatMessage,
  DiagramSpec,
  DrawingTool,
  Grade1ExerciseSpec,
} from '../types/board';
import type { ActiveStudyTool, StudyToolKind } from '../types/tools';
import { computePopoverPosition, computeRadialRingPositions } from '../utils/boardGeometry';
import { DiagramRenderer } from './DiagramRenderer';
import { AiChatPanel } from './bubble/AiChatPanel';
import { DrawingToolsPanel } from './bubble/DrawingToolsPanel';
import { Grade1MathPanel } from './bubble/Grade1MathPanel';
import { StudyToolsPanel } from './bubble/StudyToolsPanel';

type RadialSectionId =
  | 'draw'
  | 'ai'
  | 'shapes'
  | 'tools'
  | 'grade1'
  | 'notes'
  | 'eraser'
  | 'export';

interface UnifiedBubbleProps {
  theme: BoardTheme;
  activeTool: DrawingTool;
  activeColor: string;
  strokeWidth: number;
  canUndo: boolean;
  canRedo: boolean;
  messages: ChatMessage[];
  aiLoading: boolean;
  onSelectTool: (tool: DrawingTool) => void;
  onSelectColor: (hex: string) => void;
  onChangeWidth: (width: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearBoard: () => void;
  onExportPng: () => void;
  onOpenSync: () => void;
  onSendMessage: (question: string, includeBoardImage: boolean) => Promise<void>;
  onPlaceDiagram: (diagram: DiagramSpec) => void;
  onPlaceWorksheet: (exercise: Grade1ExerciseSpec) => void;
  onPinNote: (title: string, content: string, color: string) => void;
  studyTools: ActiveStudyTool[];
  onToggleStudyTool: (id: StudyToolKind) => void;
  onDisableAllStudyTools: () => void;
}

const RADIAL_SECTIONS: {
  id: RadialSectionId;
  shortLabel: string;
  label: string;
  panelTitle: string;
  icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
}[] = [
  { id: 'draw', shortLabel: 'Bút', label: 'Bút & Màu', panelTitle: 'Công cụ viết & Màu phấn', icon: Pencil, accentClass: 'text-amber-300' },
  { id: 'ai', shortLabel: 'AI', label: 'Trợ lý AI', panelTitle: 'Trợ lý AI giải toán', icon: Bot, accentClass: 'text-sky-400' },
  { id: 'shapes', shortLabel: 'Hình', label: 'Hình vẽ', panelTitle: 'Kho hình vẽ kéo thả', icon: Shapes, accentClass: 'text-emerald-400' },
  { id: 'tools', shortLabel: 'Dụng cụ', label: 'Dụng cụ học tập', panelTitle: 'Dụng cụ học tập (8)', icon: Ruler, accentClass: 'text-cyan-300' },
  { id: 'grade1', shortLabel: 'Toán 1', label: 'Toán lớp 1', panelTitle: '10 Bài tập Toán lớp 1', icon: Calculator, accentClass: 'text-lime-300' },
  { id: 'notes', shortLabel: 'Ghi chú', label: 'Ghi chú nổi bật', panelTitle: 'Màu nổi bật & Ghim ghi chú', icon: Highlighter, accentClass: 'text-yellow-300' },
  { id: 'eraser', shortLabel: 'Tẩy', label: 'Tẩy & Sửa', panelTitle: 'Tẩy phấn & Hoàn tác', icon: Eraser, accentClass: 'text-rose-300' },
  { id: 'export', shortLabel: 'Lưu', label: 'Lưu & Đồng bộ', panelTitle: 'Xuất ảnh & Đồng bộ đám mây', icon: Download, accentClass: 'text-teal-300' },
];

const HUB_RADIUS = 30;
const RING_RADIUS = 102;
const ITEM_RADIUS = 28;
const TOP_HEADER_CLEARANCE = 68;

export const UnifiedBubble: React.FC<UnifiedBubbleProps> = ({
  theme,
  activeTool,
  activeColor,
  strokeWidth,
  canUndo,
  canRedo,
  messages,
  aiLoading,
  onSelectTool,
  onSelectColor,
  onChangeWidth,
  onUndo,
  onRedo,
  onClearBoard,
  onExportPng,
  onOpenSync,
  onSendMessage,
  onPlaceDiagram,
  onPlaceWorksheet,
  onPinNote,
  studyTools,
  onToggleStudyTool,
  onDisableAllStudyTools,
}) => {
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1440,
    h: typeof window !== 'undefined' ? window.innerHeight : 900,
  }));

  const [hubCenter, setHubCenter] = useState(() => {
    if (typeof window === 'undefined') return { x: 120, y: 200 };
    const isMobile = window.innerWidth < 768;
    return {
      x: isMobile ? window.innerWidth - 54 : 112,
      y: isMobile ? window.innerHeight - 64 : 210,
    };
  });

  const [ringOpen, setRingOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [activePanel, setActivePanel] = useState<RadialSectionId | null>(null);
  const [quickNoteText, setQuickNoteText] = useState('');
  const [selectedNoteColor, setSelectedNoteColor] = useState(NOTE_HIGHLIGHT_COLORS[0].hex);

  const assemblyRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const dragRef = useRef<{
    pointerId: number;
    captureEl: HTMLElement;
    startX: number;
    startY: number;
    origCx: number;
    origCy: number;
    latestCx: number;
    latestCy: number;
    moved: boolean;
  } | null>(null);
  const suppressNextClickRef = useRef(false);

  const radialLayout = useMemo(
    () =>
      computeRadialRingPositions(
        hubCenter.x,
        hubCenter.y,
        RADIAL_SECTIONS.length,
        RING_RADIUS,
        ITEM_RADIUS,
        viewport.w,
        viewport.h
      ),
    [hubCenter.x, hubCenter.y, viewport.h, viewport.w]
  );

  const effectiveCenter = ringOpen ? radialLayout.hubCenter : hubCenter;

  // Relative radial item offsets around (0, 0) so dragging only updates one GPU transform
  const relativeRadialOffsets = useMemo(
    () =>
      RADIAL_SECTIONS.map((_, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / RADIAL_SECTIONS.length;
        return {
          x: Math.round(RING_RADIUS * Math.cos(angle)),
          y: Math.round(RING_RADIUS * Math.sin(angle)),
        };
      }),
    []
  );

  const panelDimensions = useMemo(() => {
    const w = Math.min(356, viewport.w - 24);
    if (activePanel === 'ai') return { w, h: Math.min(486, viewport.h - 90) };
    if (activePanel === 'draw') return { w: Math.min(296, viewport.w - 24), h: 380 };
    if (activePanel === 'shapes') return { w: Math.min(340, viewport.w - 24), h: 350 };
    if (activePanel === 'tools') return { w: Math.min(340, viewport.w - 24), h: Math.min(440, viewport.h - 90) };
    if (activePanel === 'grade1') return { w: Math.min(356, viewport.w - 24), h: Math.min(470, viewport.h - 90) };
    if (activePanel === 'notes') return { w: Math.min(316, viewport.w - 24), h: 220 };
    if (activePanel === 'eraser') return { w: Math.min(280, viewport.w - 24), h: 210 };
    return { w: Math.min(280, viewport.w - 24), h: 205 };
  }, [activePanel, viewport.h, viewport.w]);

  const popoverPos = useMemo(
    () =>
      computePopoverPosition(
        effectiveCenter.x,
        effectiveCenter.y,
        RING_RADIUS + ITEM_RADIUS + 8,
        panelDimensions.w,
        panelDimensions.h,
        viewport.w,
        viewport.h
      ),
    [effectiveCenter.x, effectiveCenter.y, panelDimensions.h, panelDimensions.w, viewport.h, viewport.w]
  );

  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setViewport({ w, h });
      setHubCenter((prev) => ({
        x: Math.min(Math.max(HUB_RADIUS + 12, prev.x), Math.max(HUB_RADIUS + 12, w - HUB_RADIUS - 12)),
        y: Math.min(Math.max(TOP_HEADER_CLEARANCE + HUB_RADIUS, prev.y), Math.max(TOP_HEADER_CLEARANCE + HUB_RADIUS, h - HUB_RADIUS - 12)),
      }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activePanel) {
          setActivePanel(null);
        } else if (ringOpen) {
          setRingOpen(false);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activePanel, ringOpen]);

  // Cancel any pending rAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const clampDragCenter = (rawX: number, rawY: number) => {
    const pad = ringOpen ? RING_RADIUS + ITEM_RADIUS + 14 : HUB_RADIUS + 10;
    const topPad = ringOpen ? TOP_HEADER_CLEARANCE + RING_RADIUS + ITEM_RADIUS : TOP_HEADER_CLEARANCE + HUB_RADIUS;
    return {
      x: Math.round(Math.min(Math.max(pad, rawX), Math.max(pad, viewport.w - pad))),
      y: Math.round(Math.min(Math.max(topPad, rawY), Math.max(topPad, viewport.h - pad))),
    };
  };

  const applyDragTransform = (cx: number, cy: number) => {
    if (assemblyRef.current) {
      assemblyRef.current.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
    }
    if (panelRef.current && activePanel) {
      const nextPop = computePopoverPosition(
        cx,
        cy,
        RING_RADIUS + ITEM_RADIUS + 8,
        panelDimensions.w,
        panelDimensions.h,
        viewport.w,
        viewport.h
      );
      panelRef.current.style.transform = `translate3d(${nextPop.x}px, ${nextPop.y}px, 0)`;
    }
  };

  const startBubbleDrag = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    suppressNextClickRef.current = false;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore if capture is unsupported
    }
    dragRef.current = {
      pointerId: e.pointerId,
      captureEl: e.currentTarget,
      startX: e.clientX,
      startY: e.clientY,
      origCx: effectiveCenter.x,
      origCy: effectiveCenter.y,
      latestCx: effectiveCenter.x,
      latestCy: effectiveCenter.y,
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > 4) {
      drag.moved = true;
      setIsDragging(true);
    }

    const clamped = clampDragCenter(drag.origCx + dx, drag.origCy + dy);
    drag.latestCx = clamped.x;
    drag.latestCy = clamped.y;

    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (dragRef.current) {
          applyDragTransform(dragRef.current.latestCx, dragRef.current.latestCy);
        }
      });
    }
  };

  const finishBubbleDrag = (e: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    try {
      if (drag.captureEl.hasPointerCapture(e.pointerId)) {
        drag.captureEl.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }

    if (drag.moved) {
      suppressNextClickRef.current = true;
      setHubCenter({ x: drag.latestCx, y: drag.latestCy });
    }
    dragRef.current = null;
    setIsDragging(false);
  };

  const handleHubClick = () => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (ringOpen) {
      setRingOpen(false);
      setActivePanel(null);
    } else {
      setHubCenter(radialLayout.hubCenter);
      setRingOpen(true);
    }
  };

  const handleSelectSection = (id: RadialSectionId) => {
    setActivePanel((prev) => (prev === id ? null : id));
  };

  const handleDiagramDragStart = (e: React.DragEvent, diagram: DiagramSpec) => {
    e.dataTransfer.setData('application/x-board-diagram', JSON.stringify(diagram));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleQuickNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = quickNoteText.trim();
    if (!text) return;
    onPinNote('Ghi chú trọng tâm', text, selectedNoteColor);
    setQuickNoteText('');
  };

  const activeSectionMeta = RADIAL_SECTIONS.find((s) => s.id === activePanel);
  const resolvedActiveColor = resolveColorForTheme(activeColor, theme);

  return (
    <div data-testid="unified-bubble-root" className="fixed inset-0 pointer-events-none z-30">
      {/* GPU-composited Assembly centered at effectiveCenter via translate3d */}
      <div
        ref={assemblyRef}
        style={{
          transform: `translate3d(${effectiveCenter.x}px, ${effectiveCenter.y}px, 0)`,
          willChange: 'transform',
        }}
        className="absolute top-0 left-0"
      >
        {/* Draggable orbital ring backdrop when expanded (press & hold anywhere on ring to drag too) */}
        {ringOpen && (
          <div
            onPointerDown={startBubbleDrag}
            onPointerMove={handlePointerMove}
            onPointerUp={finishBubbleDrag}
            onPointerCancel={finishBubbleDrag}
            style={{
              width: (RING_RADIUS + ITEM_RADIUS + 12) * 2,
              height: (RING_RADIUS + ITEM_RADIUS + 12) * 2,
              left: -(RING_RADIUS + ITEM_RADIUS + 12),
              top: -(RING_RADIUS + ITEM_RADIUS + 12),
            }}
            className={`pointer-events-auto absolute rounded-full bg-slate-950/38 border border-white/15 backdrop-blur-sm touch-none select-none ${
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
          />
        )}

        {/* Radial Feature Nodes arranged evenly around (0, 0) */}
        {ringOpen &&
          RADIAL_SECTIONS.map((sec, idx) => {
            const offset = relativeRadialOffsets[idx];
            const Icon = sec.icon;
            const isOpen = activePanel === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                data-testid={`radial-node-${sec.id}`}
                aria-label={sec.label}
                aria-expanded={isOpen}
                onClick={() => handleSelectSection(sec.id)}
                style={{
                  width: ITEM_RADIUS * 2,
                  height: ITEM_RADIUS * 2,
                  left: offset.x - ITEM_RADIUS,
                  top: offset.y - ITEM_RADIUS,
                }}
                className={`pointer-events-auto absolute rounded-full flex flex-col items-center justify-center border shadow-xl transition-transform duration-150 hover:scale-105 ${
                  isOpen
                    ? 'bg-amber-400 text-slate-950 border-white ring-2 ring-amber-300/60 scale-105'
                    : 'bg-slate-900/95 text-slate-100 border-white/20 hover:border-white/45'
                }`}
              >
                <Icon className={`w-4 h-4 ${isOpen ? 'text-slate-950' : sec.accentClass}`} />
                <span className="text-[9px] font-semibold leading-none mt-1 whitespace-nowrap">
                  {sec.shortLabel}
                </span>
              </button>
            );
          })}

        {/* Central Draggable Circular Bubble Hub */}
        <button
          type="button"
          data-testid="unified-bubble-hub"
          aria-label={ringOpen ? 'Đóng vòng tròn điều khiển' : 'Mở vòng tròn điều khiển'}
          aria-expanded={ringOpen}
          onPointerDown={startBubbleDrag}
          onPointerMove={handlePointerMove}
          onPointerUp={finishBubbleDrag}
          onPointerCancel={finishBubbleDrag}
          onClick={handleHubClick}
          style={{
            width: HUB_RADIUS * 2,
            height: HUB_RADIUS * 2,
            left: -HUB_RADIUS,
            top: -HUB_RADIUS,
            borderColor: isDragging || ringOpen ? '#FBBF24' : resolvedActiveColor,
          }}
          className={`pointer-events-auto absolute rounded-full bg-slate-900/95 text-slate-100 border-2 shadow-2xl backdrop-blur-md flex flex-col items-center justify-center touch-none select-none ${
            isDragging
              ? 'cursor-grabbing scale-105 ring-4 ring-amber-400/25'
              : 'cursor-grab hover:scale-105 transition-transform duration-150'
          }`}
        >
          {ringOpen ? (
            <X className="w-6 h-6 text-amber-300 pointer-events-none" />
          ) : (
            <>
              <Layers className="w-5 h-5 text-sky-400 pointer-events-none" />
              <span className="text-[9px] font-bold tracking-tight mt-0.5 text-slate-200 pointer-events-none">
                Menu
              </span>
            </>
          )}
        </button>
      </div>

      {/* Pop-out Drawer Panel for the selected radial item ONLY */}
      {ringOpen && activePanel && activeSectionMeta && (
        <section
          ref={panelRef}
          role="region"
          data-testid={`radial-panel-${activePanel}`}
          aria-label={activeSectionMeta.panelTitle}
          style={{
            top: 0,
            left: 0,
            transform: `translate3d(${popoverPos.x}px, ${popoverPos.y}px, 0)`,
            willChange: 'transform',
            width: panelDimensions.w,
          }}
          className="pointer-events-auto absolute rounded-2xl bg-slate-900/96 text-slate-100 border border-white/15 shadow-2xl backdrop-blur-md overflow-hidden"
        >
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-white/5 border-b border-white/10">
            <div className="flex items-center gap-2 min-w-0">
              <activeSectionMeta.icon className={`w-4 h-4 shrink-0 ${activeSectionMeta.accentClass}`} />
              <h3 className="text-xs font-semibold truncate">{activeSectionMeta.panelTitle}</h3>
            </div>
            <button
              type="button"
              onClick={() => setActivePanel(null)}
              aria-label={`Đóng ${activeSectionMeta.panelTitle}`}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {activePanel === 'draw' && (
            <DrawingToolsPanel
              theme={theme}
              activeTool={activeTool}
              activeColor={activeColor}
              strokeWidth={strokeWidth}
              canUndo={canUndo}
              canRedo={canRedo}
              onSelectTool={onSelectTool}
              onSelectColor={onSelectColor}
              onChangeWidth={onChangeWidth}
              onUndo={onUndo}
              onRedo={onRedo}
              onClearBoard={onClearBoard}
            />
          )}

          {activePanel === 'ai' && (
            <AiChatPanel
              theme={theme}
              activeColor={activeColor}
              messages={messages}
              isLoading={aiLoading}
              onSendMessage={onSendMessage}
              onPlaceDiagram={onPlaceDiagram}
              onPinNote={onPinNote}
              onSelectHighlightColor={(hex) => {
                onSelectColor(hex);
                if (activeTool === 'eraser' || activeTool === 'select') {
                  onSelectTool('highlighter');
                }
              }}
            />
          )}

          {activePanel === 'shapes' && (
            <div className="p-3.5 space-y-2.5">
              <p className="text-[11px] text-slate-300">
                Kéo hình từ đây thả ra bảng hoặc bấm <strong>Đưa lên</strong> để học sinh quan sát trực quan.
              </p>
              <div className="grid grid-cols-2 gap-2 max-h-[265px] overflow-y-auto thin-scrollbar">
                {PRESET_DIAGRAMS.map((d) => (
                  <div
                    key={d.id}
                    draggable
                    onDragStart={(e) => handleDiagramDragStart(e, d)}
                    className="rounded-xl bg-slate-950/75 border border-white/15 p-2 cursor-grab active:cursor-grabbing hover:border-sky-400/60 transition-colors"
                  >
                    <div className="h-20 w-full">
                      <DiagramRenderer diagram={d} theme="navy" width={144} height={82} />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-1">
                      <span className="text-[11px] font-medium text-slate-200 truncate">
                        {d.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => onPlaceDiagram(d)}
                        aria-label={`Đưa ${d.title} lên bảng`}
                        className="px-2 py-0.5 rounded bg-sky-500/25 text-sky-200 hover:bg-sky-500/40 text-[10px] font-semibold shrink-0"
                      >
                        Đưa lên
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activePanel === 'tools' && (
            <StudyToolsPanel
              tools={studyTools}
              onToggleTool={onToggleStudyTool}
              onDisableAll={onDisableAllStudyTools}
            />
          )}

          {activePanel === 'grade1' && (
            <Grade1MathPanel onPlaceWorksheet={onPlaceWorksheet} />
          )}

          {activePanel === 'notes' && (
            <div className="p-3.5 space-y-3">
              <div>
                <div className="text-[11px] font-medium text-slate-400 mb-2">
                  Chọn màu nổi bật (tô sáng hoặc ghim thẻ)
                </div>
                <div className="flex items-center gap-2">
                  {NOTE_HIGHLIGHT_COLORS.map((c) => {
                    const selected = selectedNoteColor.toUpperCase() === c.hex.toUpperCase();
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedNoteColor(c.hex);
                          onSelectColor(c.hex);
                          onSelectTool('highlighter');
                        }}
                        aria-label={`Chọn màu nổi bật ${c.name}`}
                        className={`w-8 h-8 rounded-lg border transition-transform ${
                          selected
                            ? 'scale-110 border-white ring-2 ring-amber-300/70'
                            : 'border-white/25 hover:scale-105'
                        }`}
                        style={{ backgroundColor: resolveColorForTheme(c.hex, theme) }}
                      />
                    );
                  })}
                </div>
              </div>

              <form onSubmit={handleQuickNoteSubmit} className="space-y-2">
                <input
                  type="text"
                  value={quickNoteText}
                  onChange={(e) => setQuickNoteText(e.target.value)}
                  placeholder="Nhập công thức hoặc ý chính cần nhớ..."
                  aria-label="Nhập ghi chú nhanh để ghim lên bảng"
                  className="w-full px-3 py-2 rounded-xl bg-white/8 border border-white/15 text-xs text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-amber-400"
                />
                <button
                  type="submit"
                  disabled={!quickNoteText.trim()}
                  aria-label="Ghim ghi chú lên bảng"
                  className="w-full py-2 rounded-xl text-xs font-semibold text-slate-950 disabled:opacity-40 flex items-center justify-center gap-1.5"
                  style={{ backgroundColor: selectedNoteColor }}
                >
                  <Pin className="w-3.5 h-3.5" />
                  <span>Ghim ghi chú nổi bật lên bảng</span>
                </button>
              </form>
            </div>
          )}

          {activePanel === 'eraser' && (
            <div className="p-3.5 space-y-2.5">
              <button
                type="button"
                onClick={() => onSelectTool('eraser')}
                aria-pressed={activeTool === 'eraser'}
                className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                  activeTool === 'eraser'
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-white/8 hover:bg-white/14 text-slate-100'
                }`}
              >
                <Eraser className="w-4 h-4" />
                <span>{activeTool === 'eraser' ? 'Đang bật Tẩy phấn' : 'Chuyển sang Tẩy phấn'}</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onUndo}
                  disabled={!canUndo}
                  className="py-2 rounded-xl bg-white/6 hover:bg-white/12 disabled:opacity-35 text-xs font-medium flex items-center justify-center gap-1.5"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span>Hoàn tác</span>
                </button>
                <button
                  type="button"
                  onClick={onRedo}
                  disabled={!canRedo}
                  className="py-2 rounded-xl bg-white/6 hover:bg-white/12 disabled:opacity-35 text-xs font-medium flex items-center justify-center gap-1.5"
                >
                  <Redo2 className="w-3.5 h-3.5" />
                  <span>Làm lại</span>
                </button>
              </div>

              <button
                type="button"
                onClick={onClearBoard}
                className="w-full py-2 rounded-xl bg-rose-500/18 hover:bg-rose-500/28 text-rose-200 text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa toàn bộ bảng</span>
              </button>
            </div>
          )}

          {activePanel === 'export' && (
            <div className="p-3.5 space-y-2.5">
              <button
                type="button"
                onClick={onExportPng}
                className="w-full py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Lưu tranh vẽ thành ảnh PNG</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActivePanel(null);
                  onOpenSync();
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <Cloud className="w-4 h-4" />
                <span>Đồng bộ đa thiết bị &amp; Bảng đã lưu</span>
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
