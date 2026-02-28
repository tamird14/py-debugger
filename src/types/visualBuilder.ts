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
  /** Per-cell values from the builder. For value arrays: numbers/strings. For shape arrays: config dicts. */
  values?: (number | string | ShapeArrayElementConfig)[];
  /** Shape type for each array cell ('circle', 'rect', 'arrow'). When set, array renders shapes instead of values. */
  elementType?: 'circle' | 'rect' | 'arrow';
  /** Whether to show [i] index labels on array cells. */
  showIndex?: boolean;
  /** Array2D: number of rows and columns */
  numRows?: number;
  numCols?: number;
  alpha?: number;
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

export const VISUAL_ELEM_SCHEMA: ClassDoc[] = [
  {
    className: 'V',
    constructorParams: 'expr: str',
    docstring: 'Bind a property to a Python expression evaluated each step. The expression has access to all current variables plus math helpers (sqrt, floor, ceil, log, pow, abs, min, max, sum, round, len, pi). Examples: V("i"), V("i * 2 + 1"), V("(row, col)"), V("max(i, j)").',
    properties: [],
  },
  {
    className: 'VisualElem',
    constructorParams: '',
    docstring: 'Base class for all visual elements. Has update(scope, params) called each execution step. Assign V("expr") to any property to make it reactive.',
    properties: [
      { name: 'position', type: 'tuple[int, int]', description: 'Top-left corner (row, col) on the grid.' },
      { name: 'visible', type: 'bool', description: 'Whether the element is shown.' },
      { name: 'alpha', type: 'float', description: 'Opacity from 0.0 (transparent) to 1.0 (opaque). Default 1.0. Supports V() bindings.' },
    ],
  },
  {
    className: 'update',
    constructorParams: 'scope, params',
    docstring: 'Define a top-level update(scope, params) function to run custom logic on every execution step. scope is a list of (func_name, line_number) tuples for the call stack. params is a dict of variable names to their current values. Use this to imperatively update element properties each step.',
    properties: [],
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
    constructorParams: 'var_name: str = "", element_type: str | None = None',
    docstring: 'Displays an array of values or visual shapes. Two approaches: (1) Dict config: set element_type="circle"/"rect"/"arrow", then arr[i] = {\'color\': (r,g,b), ...}. (2) Instance mode: arr[i] = Circle()/Rect()/Arrow() — shape position is controlled by the array, all other properties (color, size, alpha, V() bindings) come from the element. Elements with width/height > 1 shift subsequent cells accordingly.',
    properties: [
      { name: 'var_name', type: 'str', description: 'Name of the array variable (e.g. "arr", "nums"). Ignored when element_type is set.' },
      { name: 'element_type', type: 'str | None', description: 'Shape type for each cell: "circle", "rect", or "arrow". None for value arrays or instance mode (default).' },
      { name: 'position', type: 'tuple[int, int]', description: 'Top-left corner (row, col) of the first cell.' },
      { name: 'direction', type: 'str', description: '"right", "left", "down", or "up" — layout of cells.' },
      { name: 'length', type: 'int', description: 'Number of cells to reserve (default 5). Use >= max array length.' },
      { name: 'show_index', type: 'bool', description: 'Whether to show [i] index labels. Default True for value arrays, False for shape arrays.' },
      { name: 'visible', type: 'bool', description: 'Show or hide the array.' },
    ],
  },
  {
    className: 'Circle',
    constructorParams: 'pos: tuple[int, int] = (0, 0)',
    docstring: 'A circle (or ellipse) shape on the grid.',
    properties: [
      { name: 'position', type: 'tuple[int, int]', description: 'Top-left corner (row, col) of the bounding box.' },
      { name: 'width', type: 'int', description: 'Width in grid cells.' },
      { name: 'height', type: 'int', description: 'Height in grid cells.' },
      { name: 'color', type: 'tuple[int, int, int]', description: 'RGB fill color (0-255 per channel).' },
      { name: 'visible', type: 'bool', description: 'Show or hide the circle.' },
    ],
  },
  {
    className: 'Arrow',
    constructorParams: 'pos: tuple[int, int] = (0, 0)',
    docstring: 'An arrow shape on the grid. Points in the given orientation and can be rotated.',
    properties: [
      { name: 'position', type: 'tuple[int, int]', description: 'Top-left corner (row, col) of the bounding box.' },
      { name: 'width', type: 'int', description: 'Width in grid cells.' },
      { name: 'height', type: 'int', description: 'Height in grid cells.' },
      { name: 'color', type: 'tuple[int, int, int]', description: 'RGB fill color (0-255 per channel).' },
      { name: 'orientation', type: 'str', description: '"up", "down", "left", or "right". Default "up".' },
      { name: 'rotation', type: 'int', description: 'Additional rotation in degrees. Default 0.' },
      { name: 'visible', type: 'bool', description: 'Show or hide the arrow.' },
    ],
  },
];
