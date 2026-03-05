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

import { getAllSchemas } from '../visual-panel/types/elementRegistry';
import { PANEL_SCHEMA } from '../visual-panel/render-objects/panel';

import '../visual-panel/render-objects/rect/Rect';
import '../visual-panel/render-objects/circle/Circle';
import '../visual-panel/render-objects/arrow/Arrow';
import '../visual-panel/render-objects/label/Label';
import '../visual-panel/render-objects/array/arrayShapes';

export function getVisualElemSchema(): ClassDoc[] {
  return [
    PANEL_SCHEMA,
    ...getAllSchemas(),
  ];
}

export const VISUAL_ELEM_SCHEMA: ClassDoc[] = getVisualElemSchema();

export function rgbToHex(rgb?: [number, number, number], defaultColor: string = '#10b981') {
  if (!rgb) return defaultColor;
  return '#' + rgb.map(x => Math.max(0, Math.min(255, Math.floor(x))).toString(16).padStart(2,'0')).join('');
}
