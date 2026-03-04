// Visual Builder element types (serialized from Python)

export type VisualBuilderElementType = 'rect' | 'label' | 'var' | 'panel' | 'array' | 'array2d' | 'circle' | 'arrow';

export type ArrayDirection = 'right' | 'left' | 'down' | 'up';

export interface VisualBuilderElementBase {
  type: string;               // shape type
  position: [number, number]; // common position
  visible?: boolean;          // optional, default true
  alpha?: number;             // optional, default 1
  panelId?: string;
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
import { LABEL_SCHEMA } from './label';
import { ARRAY_SCHEMA } from './arrayShapes';
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
  CIRCLE_SCHEMA,
  ARROW_SCHEMA,
  LABEL_SCHEMA,
  ARRAY_SCHEMA,
];

export function rgbToHex(rgb?: [number, number, number], defaultColor: string = '#10b981') {
  if (!rgb) return defaultColor;
  return '#' + rgb.map(x => Math.max(0, Math.min(255, Math.floor(x))).toString(16).padStart(2,'0')).join('');
}
