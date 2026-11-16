import type { Grade1ExerciseSpec } from '../types/board';

export const WORKSHEET_MIN_WIDTH = 220;
export const WORKSHEET_MIN_HEIGHT = 150;
export const WORKSHEET_MAX_WIDTH = 960;
export const WORKSHEET_MAX_HEIGHT = 720;

export function getDefaultWorksheetSize(exercise: Grade1ExerciseSpec): {
  width: number;
  height: number;
} {
  if (exercise.layout === 'vertical') {
    return { width: 420, height: 220 };
  }
  if (exercise.layout === 'word_problem') {
    return { width: 450, height: 260 };
  }
  return { width: 380, height: 235 };
}

export function computeWorksheetScale(
  width: number,
  height: number,
  exercise: Grade1ExerciseSpec
): number {
  const base = getDefaultWorksheetSize(exercise);
  const scaleX = width / base.width;
  const scaleY = height / base.height;
  const raw = Math.min(scaleX, scaleY);
  return Math.max(0.65, Math.min(2.35, Math.round(raw * 100) / 100));
}

export function validateGrade1Catalog(exercises: Grade1ExerciseSpec[]): boolean {
  if (exercises.length !== 10) return false;
  const seenIds = new Set<string>();
  const seenNumbers = new Set<number>();
  for (const ex of exercises) {
    if (!ex.id || seenIds.has(ex.id)) return false;
    if (ex.number < 1 || ex.number > 10 || seenNumbers.has(ex.number)) return false;
    if (!ex.title.trim() || !ex.instruction.trim() || ex.problems.length === 0) return false;
    seenIds.add(ex.id);
    seenNumbers.add(ex.number);
  }
  return true;
}
