import React from 'react';
import {
  Compass,
  Crosshair,
  Gauge,
  Ruler,
  Search,
  Spline,
  Timer,
  TriangleRight,
  XCircle,
} from 'lucide-react';
import { STUDY_TOOLS_CATALOG } from '../../constants/studyTools';
import type { ActiveStudyTool, StudyToolKind } from '../../types/tools';

interface StudyToolsPanelProps {
  tools: ActiveStudyTool[];
  onToggleTool: (id: StudyToolKind) => void;
  onDisableAll: () => void;
}

const TOOL_ICONS: Record<StudyToolKind, React.ComponentType<{ className?: string }>> = {
  ruler: Ruler,
  compass: Compass,
  protractor: Gauge,
  set_square: TriangleRight,
  measure_tape: Crosshair,
  parabola_ruler: Spline,
  magnifier: Search,
  timer: Timer,
};

export const StudyToolsPanel: React.FC<StudyToolsPanelProps> = ({
  tools,
  onToggleTool,
  onDisableAll,
}) => {
  const activeCount = tools.filter((t) => t.enabled).length;

  return (
    <div className="p-3.5 space-y-2.5">
      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-300">
        <span>Chọn dụng cụ để đặt và thao tác trực tiếp trên bảng:</span>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onDisableAll}
            className="text-rose-300 hover:text-rose-200 font-semibold flex items-center gap-1 shrink-0"
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Tắt ({activeCount})</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 max-h-[380px] overflow-y-auto thin-scrollbar pr-0.5">
        {STUDY_TOOLS_CATALOG.map((item) => {
          const state = tools.find((t) => t.id === item.id);
          const isEnabled = Boolean(state?.enabled);
          const Icon = TOOL_ICONS[item.id];
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`study-tool-btn-${item.id}`}
              aria-pressed={isEnabled}
              onClick={() => onToggleTool(item.id)}
              className={`p-2 rounded-xl border text-left transition-all flex flex-col gap-0.5 ${
                isEnabled
                  ? 'bg-amber-400/18 border-amber-400 text-amber-100 ring-1 ring-amber-400/40'
                  : 'bg-slate-950/75 border-white/12 text-slate-200 hover:border-white/30 hover:bg-white/6'
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isEnabled ? 'text-amber-300' : 'text-sky-300'
                  }`}
                />
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                    isEnabled
                      ? 'bg-amber-400 text-slate-950'
                      : 'bg-white/10 text-slate-300'
                  }`}
                >
                  {isEnabled ? 'Đang bật' : 'Mở'}
                </span>
              </div>
              <div className="text-xs font-semibold leading-tight mt-0.5">{item.name}</div>
              <div className="text-[10px] text-slate-400 leading-snug">{item.shortDesc}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
