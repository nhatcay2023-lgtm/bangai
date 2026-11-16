import type { BoardTheme, ChalkColorOption, DiagramSpec, GridType } from '../types/board';

export interface ThemeStyle {
  id: BoardTheme;
  label: string;
  bgHex: string;
  frameHex: string;
  isLight: boolean;
  gridStroke: string;
  gridSubStroke: string;
  axisStroke: string;
  defaultChalkHex: string;
}

export const BOARD_THEMES: Record<BoardTheme, ThemeStyle> = {
  green: {
    id: 'green',
    label: 'Bảng xanh',
    bgHex: '#183829',
    frameHex: '#5C3D28',
    isLight: false,
    gridStroke: 'rgba(255, 255, 255, 0.14)',
    gridSubStroke: 'rgba(255, 255, 255, 0.06)',
    axisStroke: 'rgba(253, 224, 71, 0.65)',
    defaultChalkHex: '#F8FAFC',
  },
  black: {
    id: 'black',
    label: 'Bảng đen',
    bgHex: '#15191E',
    frameHex: '#334155',
    isLight: false,
    gridStroke: 'rgba(255, 255, 255, 0.13)',
    gridSubStroke: 'rgba(255, 255, 255, 0.05)',
    axisStroke: 'rgba(56, 189, 248, 0.7)',
    defaultChalkHex: '#F8FAFC',
  },
  navy: {
    id: 'navy',
    label: 'Bảng Navy',
    bgHex: '#132036',
    frameHex: '#1E293B',
    isLight: false,
    gridStroke: 'rgba(186, 230, 253, 0.15)',
    gridSubStroke: 'rgba(186, 230, 253, 0.06)',
    axisStroke: 'rgba(253, 224, 71, 0.7)',
    defaultChalkHex: '#F8FAFC',
  },
  paper: {
    id: 'paper',
    label: 'Bảng trắng',
    bgHex: '#F8FAFC',
    frameHex: '#CBD5E1',
    isLight: true,
    gridStroke: 'rgba(15, 23, 42, 0.14)',
    gridSubStroke: 'rgba(15, 23, 42, 0.06)',
    axisStroke: 'rgba(2, 132, 199, 0.75)',
    defaultChalkHex: '#0F172A',
  },
};

export const GRID_OPTIONS: { id: GridType; label: string }[] = [
  { id: 'none', label: 'Trơn' },
  { id: 'square', label: 'Ô vuông' },
  { id: 'lined', label: 'Ô ly chữ' },
  { id: 'axes', label: 'Trục Oxy' },
];

export const CHALK_COLORS: ChalkColorOption[] = [
  { id: 'white', name: 'Phấn trắng / Mực đen', hex: '#F8FAFC', paperHex: '#0F172A' },
  { id: 'yellow', name: 'Vàng chanh', hex: '#FDE047', paperHex: '#CA8A04' },
  { id: 'sky', name: 'Xanh da trời', hex: '#38BDF8', paperHex: '#0284C7' },
  { id: 'green', name: 'Xanh lá non', hex: '#4ADE80', paperHex: '#16A34A' },
  { id: 'coral', name: 'Hồng san hô', hex: '#FB7185', paperHex: '#E11D48' },
  { id: 'amber', name: 'Cam hổ phách', hex: '#FB923C', paperHex: '#EA580C' },
  { id: 'lavender', name: 'Tím oải hương', hex: '#C084FC', paperHex: '#9333EA' },
  { id: 'teal', name: 'Ngọc lam', hex: '#2DD4BF', paperHex: '#0D9488' },
];

export const NOTE_HIGHLIGHT_COLORS: ChalkColorOption[] = [
  { id: 'yellow', name: 'Nổi bật Vàng', hex: '#FDE047', paperHex: '#EAB308' },
  { id: 'sky', name: 'Nổi bật Xanh dương', hex: '#38BDF8', paperHex: '#0284C7' },
  { id: 'green', name: 'Nổi bật Xanh lá', hex: '#4ADE80', paperHex: '#16A34A' },
  { id: 'coral', name: 'Nổi bật Hồng', hex: '#FB7185', paperHex: '#E11D48' },
  { id: 'amber', name: 'Nổi bật Cam', hex: '#FB923C', paperHex: '#EA580C' },
  { id: 'lavender', name: 'Nổi bật Tím', hex: '#C084FC', paperHex: '#9333EA' },
];

export function resolveColorForTheme(hex: string, theme: BoardTheme): string {
  const isLight = BOARD_THEMES[theme].isLight;
  if (isLight && (hex.toUpperCase() === '#F8FAFC' || hex.toUpperCase() === '#FFFFFF')) {
    return '#0F172A';
  }
  if (!isLight && hex.toUpperCase() === '#0F172A') {
    return '#F8FAFC';
  }
  return hex;
}

export const PRESET_DIAGRAMS: DiagramSpec[] = [
  {
    id: 'preset-right-triangle',
    title: 'Tam giác vuông 3-4-5',
    kind: 'triangle',
    caption: 'a² + b² = c² (Pythagore)',
    color: '#FDE047',
    params: {
      a: 4,
      b: 3,
      c: 5,
      labelA: 'a = 4',
      labelB: 'b = 3',
      labelC: 'c = 5',
      rightAngle: true,
    },
  },
  {
    id: 'preset-parabola',
    title: 'Đồ thị y = x² - 2',
    kind: 'coordinate_graph',
    caption: 'Parabol đỉnh (0, -2)',
    color: '#38BDF8',
    params: {
      expression: 'x^2 - 2',
      xMin: -4,
      xMax: 4,
      yMin: -4,
      yMax: 6,
    },
  },
  {
    id: 'preset-circle',
    title: 'Đường tròn tâm O',
    kind: 'circle',
    caption: 'S = π·R² · C = 2π·R',
    color: '#4ADE80',
    params: {
      radiusLabel: 'R = 5 cm',
      centerLabel: 'O',
    },
  },
  {
    id: 'preset-fraction',
    title: 'Thanh phân số 3/5',
    kind: 'fraction_bar',
    caption: 'Biểu diễn trực quan 3/5 = 60%',
    color: '#FB7185',
    params: {
      numerator: 3,
      denominator: 5,
    },
  },
];
