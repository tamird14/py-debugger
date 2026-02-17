// Visual Builder element types (serialized from Python)

export type VisualBuilderElementType = 'rect' | 'label' | 'var' | 'panel' | 'array';

export type ArrayDirection = 'right' | 'left' | 'down' | 'up';

export interface VisualBuilderElement {
  type: VisualBuilderElementType;
  position: [number, number];
  visible: boolean;
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
  length?: number; // number of cells (used when no timeline yet)
  /** Per-cell values from the builder (e.g. arr_viz[0]=2). When set, these are shown instead of timeline. */
  values?: (number | string)[];
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

export const VISUAL_ELEM_SCHEMA: ClassDoc[] = [
  {
    className: 'VisualElem',
    constructorParams: '',
    docstring: 'Base class for all visual elements. Has update(scope, params) called each execution step.',
    properties: [
      { name: 'position', type: 'tuple[int, int]', description: 'Top-left corner (row, col) on the grid.' },
      { name: 'visible', type: 'bool', description: 'Whether the element is shown.' },
    ],
  },
  {
    className: 'Panel',
    constructorParams: 'name: str = "Panel"',
    docstring: 'Container for grouping visual elements. Use add(elem) and remove(elem) to manage children.',
    properties: [
      { name: 'name', type: 'str', description: 'Panel title.' },
      { name: 'position', type: 'tuple[int, int]', description: 'Top-left corner (row, col).' },
      { name: 'width', type: 'int', description: 'Width in grid cells.' },
      { name: 'height', type: 'int', description: 'Height in grid cells.' },
      { name: 'visible', type: 'bool', description: 'Whether the panel is shown.' },
    ],
    methods: [
      { name: 'add', signature: 'add(elem: VisualElem)', docstring: 'Add a visual element to this panel.' },
      { name: 'remove', signature: 'remove(elem: VisualElem)', docstring: 'Remove a visual element from this panel.' },
    ],
  },
  {
    className: 'Rect',
    constructorParams: 'pos: tuple[int, int] = (0, 0)',
    docstring: 'A rectangle shape on the grid.',
    properties: [
      { name: 'position', type: 'tuple[int, int]', description: 'Top-left corner (row, col) of the rectangle.' },
      { name: 'width', type: 'int', description: 'Width in grid cells.' },
      { name: 'height', type: 'int', description: 'Height in grid cells.' },
      { name: 'color', type: 'tuple[int, int, int]', description: 'RGB fill color (0-255 per channel).' },
      { name: 'visible', type: 'bool', description: 'Show or hide the rectangle.' },
    ],
  },
  {
    className: 'Label',
    constructorParams: 'label: str = ""',
    docstring: 'Text label. Use {var_name} in the text to interpolate variable values.',
    properties: [
      { name: 'label', type: 'str', description: 'Display text. Use {var} for variable interpolation.' },
      { name: 'position', type: 'tuple[int, int]', description: 'Top-left corner (row, col).' },
      { name: 'width', type: 'int', description: 'Width in grid cells.' },
      { name: 'height', type: 'int', description: 'Height in grid cells.' },
      { name: 'font_size', type: 'int', description: 'Font size in pixels.' },
      { name: 'color', type: 'tuple[int, int, int]', description: 'RGB text color.' },
      { name: 'visible', type: 'bool', description: 'Show or hide the label.' },
    ],
  },
  {
    className: 'Var',
    constructorParams: 'var_name: str = ""',
    docstring: 'Displays a variable value (int/float) from the current execution step.',
    properties: [
      { name: 'var_name', type: 'str', description: 'Name of the variable to display.' },
      { name: 'position', type: 'tuple[int, int]', description: 'Top-left corner (row, col).' },
      { name: 'display', type: 'str', description: '"name-value" or "value-only".' },
      { name: 'visible', type: 'bool', description: 'Show or hide the variable cell.' },
    ],
  },
  {
    className: 'Array',
    constructorParams: 'var_name: str = ""',
    docstring: 'Displays an array variable (list) from the current execution step. Each cell shows one element.',
    properties: [
      { name: 'var_name', type: 'str', description: 'Name of the array variable (e.g. "arr", "nums").' },
      { name: 'position', type: 'tuple[int, int]', description: 'Top-left corner (row, col) of the first cell.' },
      { name: 'direction', type: 'str', description: '"right", "left", "down", or "up" — layout of cells.' },
      { name: 'length', type: 'int', description: 'Number of cells to reserve (default 5). Use ≥ max array length.' },
      { name: 'visible', type: 'bool', description: 'Show or hide the array.' },
    ],
  },
];
