import type { RenderableElement } from "../views/rendererRegistry";

export interface CellPosition {
  row: number;
  col: number;
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
  width?: number;    // in cells
  height?: number;   // in cells
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
    width: number;
    height: number;
    title?: string;
    panelStyle?: PanelStyle;
  };
  // Optional panel association for non-panel objects
  panelId?: string;
  // Styling options
  style?: CellStyle;
  // Shape-specific props
  shapeProps?: ShapeProps;
  // Invalid computation reason (for grayed-out rendering)
  invalidReason?: string;
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

