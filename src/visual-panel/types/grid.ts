import type { RenderableElement } from "../views/rendererRegistry";

export interface CellPosition {
  row: number;
  col: number;
}

// Variable dictionary types
export type VariableType = 'int' | 'float' | 'str' | 'arr[int]' | 'arr[str]' | 'arr2d[int]' | 'arr2d[str]';

export interface IntVariable {
  type: 'int';
  value: number;
}

export interface FloatVariable {
  type: 'float';
  value: number;
}

export interface ArrayVariable {
  type: 'arr[int]';
  value: number[];
}

export interface StringVariable {
  type: 'str';
  value: string;
}

export interface StringArrayVariable {
  type: 'arr[str]';
  value: string[];
}

export interface Array2DVariable {
  type: 'arr2d[int]';
  value: number[][];
}

export interface StringArray2DVariable {
  type: 'arr2d[str]';
  value: string[][];
}

export type Variable = IntVariable | FloatVariable | ArrayVariable | StringVariable | StringArrayVariable | Array2DVariable | StringArray2DVariable;

export interface VariableDictionary {
  [name: string]: Variable;
}

// Numeric property metadata (for validation)
export interface NumericPropertyMeta {
  mustBeInteger: boolean;
  canBeExpression: boolean;
}

export const POSITION_PROPERTY_META: NumericPropertyMeta = { mustBeInteger: true, canBeExpression: true };
export const SIZE_PROPERTY_META: NumericPropertyMeta = { mustBeInteger: true, canBeExpression: true };

// Unified numeric value: fixed number or expression (variable name is just expression "i")
export interface NumericFixed {
  type: 'fixed';
  value: number;
}

export interface NumericExpr {
  type: 'expression';
  expression: string;
}

export type NumericExpression = NumericFixed | NumericExpr;

// Legacy position types (kept for backward compatibility with saved JSON files)
export interface PositionValue {
  type: 'hardcoded';
  value: number;
}

export interface PositionVarBinding {
  type: 'variable';
  varName: string;
}

export interface PositionExpression {
  type: 'expression';
  expression: string;
}

export type PositionComponent =
  | NumericExpression
  | PositionValue
  | PositionVarBinding
  | PositionExpression;

export interface PositionBinding {
  row: PositionComponent;
  col: PositionComponent;
}

export interface ArrayInfo {
  id: string;
  startRow: number;
  startCol: number;
  length: number;
}

// Styling properties for cells
export interface CellStyle {
  color?: string;       // Fill/text color
  lineWidth?: number;   // Border/stroke thickness (1-5)
  opacity?: number;     // 0-1
  fontSize?: number;    // px
}

export type ArrowOrientation = 'up' | 'down' | 'left' | 'right';

// Size can be fixed number (legacy) or NumericExpression
export type SizeValue = number | NumericExpression;

export interface ShapeProps {
  width?: SizeValue;    // in cells
  height?: SizeValue;   // in cells
  rotation?: number;    // degrees
  orientation?: ArrowOrientation;
}

export interface PanelStyle {
  borderClass: string;
  backgroundClass: string;
  titleBgClass: string;
  titleTextClass: string;
}

export const PANEL_STYLE_DEFAULT: PanelStyle = {
  borderClass: 'border-2 border-dashed',
  backgroundClass: 'bg-slate-50/50 dark:bg-slate-800/50',
  titleBgClass: 'bg-slate-50 dark:bg-slate-700',
  titleTextClass: 'text-slate-600 dark:text-slate-300',
};

export interface RenderableObjectData {
  // Unique identifier for this object (for tracking across position changes)
  objectId?: string;

  elementInfo?: RenderableElement, 

  // For panels (container)
  panel?: {
    id: string;
    width: SizeValue;
    height: SizeValue;
    title?: string;
    panelStyle?: PanelStyle;
  };
  // Optional panel association for non-panel objects
  panelId?: string;
  // Styling options
  style?: CellStyle;
  // Shape-specific props
  shapeProps?: ShapeProps;
  // Raw size binding for editing (expressions); shapeProps.width/height may be resolved numbers for display
  shapeSizeBinding?: { width: SizeValue; height: SizeValue };
  // Invalid computation reason (for grayed-out rendering)
  invalidReason?: string;
  // Position binding (if set, position is computed from variables)
  positionBinding?: PositionBinding;
  // Render/drag order (higher = on top)
  zOrder?: number;
}

export interface OccupantInfo {
  cellData: RenderableObjectData;
  originRow: number;
  originCol: number;
  isPanel: boolean;
  zOrder: number;
}

export interface GridState {
  cells: Map<string, RenderableObjectData>;
  zoom: number;
}

export interface ContextMenuState {
  isOpen: boolean;
  position: { x: number; y: number };
}

export function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

export function parseKey(key: string): CellPosition {
  const [row, col] = key.split(',').map(Number);
  return { row, col };
}

// Create a hardcoded position binding from a CellPosition
export function createHardcodedBinding(position: CellPosition): PositionBinding {
  return {
    row: { type: 'fixed', value: position.row },
    col: { type: 'fixed', value: position.col },
  };
}

// Resolve SizeValue (number or NumericExpression) to a number
export function resolveSizeValue(
  value: SizeValue | undefined,
  variables: VariableDictionary,
  expressionEvaluator?: (expression: string, vars: VariableDictionary) => number
): number {
  if (value === undefined) return 1;
  if (typeof value === 'number') return Math.max(1, Math.min(50, Math.floor(value)));
  if (value.type === 'fixed') return Math.max(1, Math.min(50, value.value));
  if (value.type === 'expression' && expressionEvaluator) {
    try {
      return Math.max(1, Math.min(50, Math.floor(expressionEvaluator(value.expression, variables))));
    } catch {
      return 1;
    }
  }
  return 1;
}

export function getArrayOffset(direction: 'right' | 'left' | 'down' | 'up', index: number): { rowDelta: number; colDelta: number } {
  switch (direction) {
    case 'left':
      return { rowDelta: 0, colDelta: -index };
    case 'down':
      return { rowDelta: index, colDelta: 0 };
    case 'up':
      return { rowDelta: -index, colDelta: 0 };
    case 'right':
    default:
      return { rowDelta: 0, colDelta: index };
  }
}

