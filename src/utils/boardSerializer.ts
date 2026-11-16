import type { BoardItem, BoardTheme, GridType, Stroke } from '../types/board';

const VALID_THEMES: BoardTheme[] = ['green', 'black', 'navy', 'paper'];
const VALID_GRIDS: GridType[] = ['none', 'square', 'lined', 'axes'];

export function sanitizeBoardId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, 128);
  return cleaned.length > 0 ? cleaned : 'board-main';
}

export function sanitizeBoardTitle(raw: string): string {
  const trimmed = raw.trim().slice(0, 120);
  return trimmed.length > 0 ? trimmed : 'Bảng học mới';
}

export function sanitizeTheme(theme: string): BoardTheme {
  return VALID_THEMES.includes(theme as BoardTheme) ? (theme as BoardTheme) : 'green';
}

export function sanitizeGridType(gridType: string): GridType {
  return VALID_GRIDS.includes(gridType as GridType) ? (gridType as GridType) : 'none';
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function compactStrokesForSync(strokes: Stroke[], maxStrokes = 800): Stroke[] {
  const bounded = strokes.slice(-maxStrokes);
  return bounded.map((s) => ({
    id: String(s.id).slice(0, 64),
    tool: s.tool,
    color: String(s.color).slice(0, 32),
    width: Number(s.width) || 4,
    opacity: Number(s.opacity) || 1,
    points: s.points.slice(0, 400).map((p) => ({
      x: round1(p.x),
      y: round1(p.y),
    })),
  }));
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        clean[k] = stripUndefined(v);
      }
    }
    return clean as T;
  }
  return value;
}

export function compactItemsForSync(items: BoardItem[], maxItems = 100): BoardItem[] {
  return items.slice(-maxItems).map((item) => {
    const kind =
      item.kind === 'note' ? 'note' : item.kind === 'worksheet' ? 'worksheet' : 'diagram';
    const maxW = kind === 'worksheet' ? 960 : 800;
    const maxH = kind === 'worksheet' ? 720 : 700;
    return {
      id: String(item.id).slice(0, 64),
      kind,
      title: String(item.title || 'Hình minh họa').slice(0, 120),
      ...(item.content !== undefined ? { content: String(item.content).slice(0, 1000) } : {}),
      color: String(item.color || '#FDE047').slice(0, 32),
      x: round1(item.x),
      y: round1(item.y),
      width: Math.max(120, Math.min(maxW, round1(item.width))),
      height: Math.max(90, Math.min(maxH, round1(item.height))),
      ...(item.diagram ? { diagram: stripUndefined(item.diagram) } : {}),
      ...(item.worksheet ? { worksheet: stripUndefined(item.worksheet) } : {}),
    };
  });
}
