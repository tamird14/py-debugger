export type ShapeType = 'circle' | 'square' | 'rectangle' | 'arrow';

export interface CellPosition {
  row: number;
  col: number;
}

// Variable dictionary types
export type VariableType = 'int' | 'float' | 'str' | 'arr[int]' | 'arr[str]';

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

export type Variable = IntVariable | FloatVariable | ArrayVariable | StringVariable | StringArrayVariable;

export interface VariableDictionary {
  [name: string]: Variable;
}

// Timeline is a list of variable dictionaries (steps in time)
export type Timeline = VariableDictionary[];

// Position binding - can be hardcoded number, variable, or expression
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
  expression: string; // e.g., "i + 1", "arr[j]", "floor(i / 2)"
}

export type PositionComponent = PositionValue | PositionVarBinding | PositionExpression;

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

export interface ShapeProps {
  width?: number;       // in cells
  height?: number;      // in cells
  rotation?: number;    // degrees
  orientation?: ArrowOrientation;
}

export interface LabelData {
  text: string;
  width?: number;       // in cells
  height?: number;      // in cells
}

export interface CellData {
  // Unique identifier for this object (for tracking across position changes)
  objectId?: string;
  shape?: ShapeType;
  // For array variables
  arrayInfo?: {
    id: string;
    index: number;
    value: string | number;
    varName?: string; // Variable name if from dictionary
    direction?: 'right' | 'left' | 'down' | 'up';
  };
  // For int variables
  intVar?: {
    name: string;
    value: number;
    display?: 'name-value' | 'value-only';
  };
  // For labels
  label?: LabelData;
  // For panels (container)
  panel?: {
    id: string;
    width: number;
    height: number;
    title?: string;
  };
  // Optional panel association for non-panel objects
  panelId?: string;
  // Styling options
  style?: CellStyle;
  // Shape-specific props
  shapeProps?: ShapeProps;
  // Invalid computation reason (for grayed-out rendering)
  invalidReason?: string;
  // Position binding (if set, position is computed from variables)
  positionBinding?: PositionBinding;
}

export interface GridState {
  cells: Map<string, CellData>;
  selectedCell: CellPosition | null;
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

// Resolve a position component to a number
// Note: For expression type, this function returns 0 and callers must handle
// expression evaluation separately using evaluateExpression from expressionEvaluator
export function resolvePositionComponent(
  component: PositionComponent,
  variables: VariableDictionary,
  expressionEvaluator?: (expression: string, vars: VariableDictionary) => number
): number {
  if (component.type === 'hardcoded') {
    return component.value;
  }
  if (component.type === 'expression') {
    if (expressionEvaluator) {
      try {
        const result = expressionEvaluator(component.expression, variables);
        return Math.max(0, Math.min(49, Math.floor(result))); // Clamp to grid bounds
      } catch {
        return 0; // Default if expression fails
      }
    }
    return 0; // No evaluator provided
  }
  // Variable binding
  const variable = variables[component.varName];
  if (variable && (variable.type === 'int' || variable.type === 'float')) {
    return Math.max(0, Math.min(49, Math.floor(variable.value))); // Clamp to grid bounds and floor floats
  }
  return 0; // Default if variable not found
}

// Resolve full position binding to CellPosition
export function resolvePosition(
  binding: PositionBinding,
  variables: VariableDictionary,
  expressionEvaluator?: (expression: string, vars: VariableDictionary) => number
): CellPosition {
  return {
    row: resolvePositionComponent(binding.row, variables, expressionEvaluator),
    col: resolvePositionComponent(binding.col, variables, expressionEvaluator),
  };
}

// Create a hardcoded position binding from a CellPosition
export function createHardcodedBinding(position: CellPosition): PositionBinding {
  return {
    row: { type: 'hardcoded', value: position.row },
    col: { type: 'hardcoded', value: position.col },
  };
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
