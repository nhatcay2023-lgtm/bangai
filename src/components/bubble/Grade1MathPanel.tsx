import React from 'react';
import { Calculator, GripVertical, Plus } from 'lucide-react';
import { GRADE1_EXERCISES } from '../../constants/grade1Exercises';
import type { Grade1ExerciseSpec } from '../../types/board';

interface Grade1MathPanelProps {
  onPlaceWorksheet: (exercise: Grade1ExerciseSpec) => void;
}

export const Grade1MathPanel: React.FC<Grade1MathPanelProps> = ({ onPlaceWorksheet }) => {
  const handleDragStart = (e: React.DragEvent, exercise: Grade1ExerciseSpec) => {
    e.dataTransfer.setData('application/x-board-worksheet', JSON.stringify(exercise));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="p-3.5 space-y-2.5">
      <p className="text-[11px] text-slate-300 leading-relaxed">
        Chọn hoặc kéo bài tập ra bảng (<strong>nền trong suốt</strong> để viết trực tiếp lên trên, kéo to nhỏ &amp; di chuyển tự do):
      </p>

      <div
        data-testid="grade1-exercise-list"
        className="space-y-2 max-h-[372px] overflow-y-auto thin-scrollbar pr-0.5"
      >
        {GRADE1_EXERCISES.map((ex) => {
          const preview =
            ex.layout === 'vertical'
              ? ex.problems
                  .slice(0, 2)
                  .map((p) => `${p.top} ${p.op} ${p.bottom}`)
                  .join('  |  ')
              : ex.problems
                  .slice(0, 2)
                  .map((p) => p.text)
                  .join('   •   ');

          return (
            <div
              key={ex.id}
              data-testid={`grade1-exercise-card-${ex.number}`}
              draggable
              onDragStart={(e) => handleDragStart(e, ex)}
              className="rounded-xl bg-slate-950/75 border border-white/12 hover:border-lime-400/55 p-2.5 transition-colors cursor-grab active:cursor-grabbing"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-lime-400/20 text-lime-200 text-[10px] font-bold shrink-0">
                    <Calculator className="w-3 h-3" />
                    Bài {ex.number}
                  </span>
                  <span className="text-xs font-semibold text-slate-100 truncate">
                    {ex.title}
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <GripVertical className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                  <button
                    type="button"
                    data-testid={`grade1-place-btn-${ex.number}`}
                    aria-label={`Đưa Bài ${ex.number} ${ex.title} lên bảng`}
                    onClick={() => onPlaceWorksheet(ex)}
                    className="px-2.5 py-1 rounded-lg bg-lime-400 hover:bg-lime-300 text-slate-950 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Đưa lên</span>
                  </button>
                </div>
              </div>

              <div className="mt-1.5 px-2 py-1 rounded-lg bg-white/5 border border-white/8 text-[11px] font-mono text-slate-300 truncate">
                {preview}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
