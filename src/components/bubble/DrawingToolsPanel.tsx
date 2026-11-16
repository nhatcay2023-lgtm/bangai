import React from 'react';
import {
  Circle,
  Eraser,
  Highlighter,
  MousePointer,
  PenLine,
  Pencil,
  Redo2,
  Square,
  Trash2,
  Undo2,
} from 'lucide-react';
import { CHALK_COLORS, resolveColorForTheme } from '../../constants/boardTheme';
import type { BoardTheme, DrawingTool } from '../../types/board';

interface DrawingToolsPanelProps {
  theme: BoardTheme;
  activeTool: DrawingTool;
  activeColor: string;
  strokeWidth: number;
  canUndo: boolean;
  canRedo: boolean;
  onSelectTool: (tool: DrawingTool) => void;
  onSelectColor: (hex: string) => void;
  onChangeWidth: (width: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearBoard: () => void;
}

const TOOL_ITEMS: { id: DrawingTool; shortLabel: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'chalk', shortLabel: 'Phấn', label: 'Phấn viết', icon: Pencil },
  { id: 'highlighter', shortLabel: 'Dạ quang', label: 'Bút dạ quang', icon: Highlighter },
  { id: 'eraser', shortLabel: 'Tẩy', label: 'Tẩy phấn', icon: Eraser },
  { id: 'line', shortLabel: 'Thước', label: 'Thước thẳng', icon: PenLine },
  { id: 'rect', shortLabel: 'Khung', label: 'Hình chữ nhật', icon: Square },
  { id: 'circle', shortLabel: 'Tròn', label: 'Hình tròn', icon: Circle },
  { id: 'select', shortLabel: 'Chọn', label: 'Chọn & Di chuyển hình', icon: MousePointer },
];

export const DrawingToolsPanel: React.FC<DrawingToolsPanelProps> = ({
  theme,
  activeTool,
  activeColor,
  strokeWidth,
  canUndo,
  canRedo,
  onSelectTool,
  onSelectColor,
  onChangeWidth,
  onUndo,
  onRedo,
  onClearBoard,
}) => {
  return (
    <div className="p-3.5 space-y-3.5">
      <div>
        <div className="text-[11px] font-medium text-slate-400 mb-2">Dụng cụ viết &amp; vẽ</div>
        <div className="grid grid-cols-4 gap-1.5">
          {TOOL_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTool === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTool(item.id)}
                aria-label={item.label}
                aria-pressed={isActive}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-[10px] font-medium transition-all ${
                  isActive
                    ? 'bg-amber-400 text-slate-950 shadow-sm'
                    : 'bg-white/6 text-slate-300 hover:bg-white/12 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 mb-1" />
                <span className="whitespace-nowrap">{item.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-[11px] font-medium text-slate-400 mb-2">Màu phấn</div>
        <div className="grid grid-cols-4 gap-2">
          {CHALK_COLORS.map((c) => {
            const displayHex = resolveColorForTheme(c.hex, theme);
            const isSelected =
              activeColor.toUpperCase() === c.hex.toUpperCase() ||
              (c.paperHex && activeColor.toUpperCase() === c.paperHex.toUpperCase());
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelectColor(c.hex)}
                aria-label={`Chọn màu ${c.name}`}
                aria-pressed={Boolean(isSelected)}
                title={c.name}
                className={`h-8 rounded-lg border transition-transform ${
                  isSelected
                    ? 'scale-105 border-white ring-2 ring-amber-400/80'
                    : 'border-white/20 hover:scale-105'
                }`}
                style={{ backgroundColor: displayHex }}
              />
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between text-[11px] font-medium text-slate-300 mb-1.5">
          <label htmlFor="radial-chalk-width">Độ dày nét</label>
          <span className="font-mono tabular-nums text-amber-300">{strokeWidth} px</span>
        </div>
        <input
          id="radial-chalk-width"
          type="range"
          min={2}
          max={24}
          step={1}
          value={strokeWidth}
          onChange={(e) => onChangeWidth(Number(e.target.value))}
          className="w-full accent-amber-400 cursor-pointer"
        />
      </div>

      <div className="pt-2 border-t border-white/10 grid grid-cols-3 gap-1.5">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Hoàn tác"
          className="flex items-center justify-center gap-1 py-2 rounded-xl bg-white/6 hover:bg-white/12 disabled:opacity-35 text-[11px] font-medium"
        >
          <Undo2 className="w-3.5 h-3.5" />
          <span>Hoàn tác</span>
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Làm lại"
          className="flex items-center justify-center gap-1 py-2 rounded-xl bg-white/6 hover:bg-white/12 disabled:opacity-35 text-[11px] font-medium"
        >
          <Redo2 className="w-3.5 h-3.5" />
          <span>Làm lại</span>
        </button>
        <button
          type="button"
          onClick={onClearBoard}
          aria-label="Xóa sạch bảng"
          className="flex items-center justify-center gap-1 py-2 rounded-xl bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 text-[11px] font-medium"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Xóa hết</span>
        </button>
      </div>
    </div>
  );
};
