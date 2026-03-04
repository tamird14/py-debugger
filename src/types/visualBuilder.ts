// Visual Builder element types (serialized from Python)

export type VisualBuilderElementType = 'rect' | 'label' | 'var' | 'panel' | 'array' | 'array2d' | 'circle' | 'arrow';

export type ArrayDirection = 'right' | 'left' | 'down' | 'up';

export interface ShapeArrayElementConfig {
  type?: 'circle' | 'rect' | 'arrow';
  color?: [number, number, number];
  orientation?: 'up' | 'down' | 'left' | 'right';
  rotation?: number;
  width?: number;
  height?: number;
  alpha?: number;
  visible?: boolean;
}

export interface VisualBuilderElementBase {
  type: string;               // shape type
  position: [number, number]; // common position
  visible?: boolean;          // optional, default true
  alpha?: number;             // optional, default 1
  panelId?: string;
}

export interface VisualBuilderElement extends VisualBuilderElementBase {
  // Type-specific
  width?: number;
  height?: number;
  color?: [number, number, number];
  label?: string;
  fontSize?: number;
  varName?: string;
  display?: 'name-value' | 'value-only';
  name?: string;
  children?: VisualBuilderElement[];
  panelId?: string; // for children of a panel
  /** Array: variable name and layout */
  direction?: ArrayDirection;
  length?: number;
  /** Per-cell values from the builder. For value arrays: numbers/strings. For shape arrays: config dicts. */
  values?: (number | string | ShapeArrayElementConfig)[];
  /** Shape type for each array cell ('circle', 'rect', 'arrow'). When set, array renders shapes instead of values. */
  elementType?: 'circle' | 'rect' | 'arrow';
  /** Whether to show [i] index labels on array cells. */
  showIndex?: boolean;
  /** Array2D: number of rows and columns */
  numRows?: number;
  numCols?: number;
  orientation?: 'up' | 'down' | 'left' | 'right';
  rotation?: number;
}


// Schema for Monaco autocomplete, hover, and API reference panel
export interface PropertyDoc {
  name: string;
  type: string;
  description: string;
}

export interface ClassDoc {
  className: string;
  constructorParams: string;
  docstring: string;
  properties: PropertyDoc[];
  methods?: { name: string; signature: string; docstring: string }[];
}

import { RECT_SCHEMA, CIRCLE_SCHEMA, ARROW_SCHEMA } from './shapes';
import { LABEL_SCHEMA } from '../components/views/LabelView';
import { VAR_SCHEMA } from '../components/views/ArrayValueView';
import { ARRAY_SCHEMA } from '../components/views/ArrayShapeView';
import { PANEL_SCHEMA } from '../components/views/PanelView';

const VISUAL_ELEM_BASE_SCHEMA: ClassDoc = {
  className: 'VisualElem',
  constructorParams: '',
  docstring: 'Base class for all visual elements. Provides shared properties like position, visibility, and alpha.',
  properties: [
    { name: 'position', type: 'tuple[int, int]', description: 'Top-left corner (row, col) on the grid.' },
    { name: 'visible', type: 'bool', description: 'Whether the element is shown.' },
    { name: 'alpha', type: 'float', description: 'Opacity from 0.0 (transparent) to 1.0 (opaque). Default 1.0.' },
  ],
};

export const VISUAL_ELEM_SCHEMA: ClassDoc[] = [
  VISUAL_ELEM_BASE_SCHEMA,
  PANEL_SCHEMA,
  RECT_SCHEMA,
  LABEL_SCHEMA,
  VAR_SCHEMA,
  ARRAY_SCHEMA,
  CIRCLE_SCHEMA,
  ARROW_SCHEMA,
];

export function rgbToHex(rgb?: [number, number, number], defaultColor: string = '#10b981') {
  if (!rgb) return defaultColor;
  return '#' + rgb.map(x => Math.max(0, Math.min(255, Math.floor(x))).toString(16).padStart(2,'0')).join('');
}
