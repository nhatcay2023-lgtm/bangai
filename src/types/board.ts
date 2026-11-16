export type BoardTheme = 'green' | 'black' | 'navy' | 'paper';

export type GridType = 'none' | 'square' | 'lined' | 'axes';

export type DrawingTool =
  | 'chalk'
  | 'highlighter'
  | 'eraser'
  | 'line'
  | 'rect'
  | 'circle'
  | 'select';

export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  id: string;
  tool: 'chalk' | 'highlighter' | 'eraser' | 'line' | 'rect' | 'circle';
  color: string;
  width: number;
  opacity: number;
  points: Point[];
}

export type DiagramKind =
  | 'triangle'
  | 'circle'
  | 'coordinate_graph'
  | 'rectangle'
  | 'fraction_bar'
  | 'angle'
  | 'formula_card';

export interface DiagramParams {
  // Triangle
  a?: number;
  b?: number;
  c?: number;
  labelA?: string;
  labelB?: string;
  labelC?: string;
  rightAngle?: boolean;
  // Circle
  radiusLabel?: string;
  diameterLabel?: string;
  centerLabel?: string;
  // Coordinate Graph
  expression?: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  // Rectangle / Square
  widthLabel?: string;
  heightLabel?: string;
  // Fraction bar
  numerator?: number;
  denominator?: number;
  // Angle
  degrees?: number;
  // Formula card
  formula?: string;
  note?: string;
}

export interface DiagramSpec {
  id: string;
  title: string;
  kind: DiagramKind;
  caption?: string;
  color?: string;
  params: DiagramParams;
}

export type Grade1Layout =
  | 'horizontal'
  | 'compare'
  | 'missing'
  | 'vertical'
  | 'word_problem';

export interface Grade1Problem {
  id: string;
  text?: string;
  top?: string;
  op?: '+' | '-';
  bottom?: string;
}

export interface Grade1ExerciseSpec {
  id: string;
  number: number;
  title: string;
  instruction: string;
  layout: Grade1Layout;
  columns?: 1 | 2;
  problems: Grade1Problem[];
}

export interface BoardItem {
  id: string;
  kind: 'diagram' | 'note' | 'worksheet';
  title: string;
  content?: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  diagram?: DiagramSpec;
  worksheet?: Grade1ExerciseSpec;
}

export interface HighlightSnippet {
  title: string;
  content: string;
  color: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  highlights?: HighlightSnippet[];
  diagrams?: DiagramSpec[];
  createdAt: number;
}

export interface BoardDocument {
  boardId: string;
  ownerId: string;
  title: string;
  theme: BoardTheme;
  gridType: GridType;
  strokes: Stroke[];
  items: BoardItem[];
  updatedAtMs?: number;
}

export interface ChalkColorOption {
  id: string;
  name: string;
  hex: string;
  paperHex?: string;
}
