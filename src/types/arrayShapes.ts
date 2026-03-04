import type { VisualBuilderElement } from "./visualBuilder";
import { rgbToHex } from "./visualBuilder";
import type { CellData } from "./grid";
import type { ClassDoc } from "./visualBuilder";
import { registerVisualElement } from "./elementRegistry";

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

export class Array1D implements VisualBuilderElement {
  type = 'array' as const;
  position: [number, number];
  visible: boolean = true;
  length: number;
  direction: 'right' | 'left' | 'down' | 'up';
  values: (number | string | ShapeArrayElementConfig)[];
  elementType?: 'rect' | 'circle' | 'arrow';
  showIndex: boolean;
  varName?: string;
  alpha: number;
  panelId?: string;

  constructor(el: VisualBuilderElement) {
    this.position = el.position;
    this.length = Math.max(1, Math.min(50, el.length ?? 5));
    this.direction = (['left', 'down', 'up'].includes(el.direction!) ? el.direction! : 'right') as 'right' | 'left' | 'down' | 'up';
    this.values = el.values ?? [];
    this.elementType = el.elementType;
    this.showIndex = el.showIndex ?? !this.elementType;
    this.varName = el.varName;
    this.alpha = el.alpha ?? 1;
    this.panelId = el.panelId;
  }

  draw(idxStart: number = 0, VB_PREFIX: string = 'vb-') {
    const cells: { cellId: string; data: Partial<CellData> }[] = [];
    let idx = idxStart;
    const arrayId = `${VB_PREFIX}array-${idx++}`;

    for (let i = 0; i < this.length; i++) {
      const cellId = `${VB_PREFIX}${idx++}`;
      const rawValue = this.values[i];
      const arrayInfoBase: NonNullable<CellData['arrayInfo']> = {
        id: arrayId,
        index: i,
        direction: this.direction,
        showIndex: this.showIndex,
      };

      const hasAnyShapeCell = this.elementType || (typeof rawValue === 'object' && rawValue !== null && 'type' in rawValue);

      if (hasAnyShapeCell && typeof rawValue === 'object' && rawValue !== null) {
        const cfg = rawValue as ShapeArrayElementConfig;
        const cellType = cfg.type ?? this.elementType;
        const mappedType = cellType === 'rect' ? 'rectangle' : cellType;
        arrayInfoBase.elementType = mappedType;
        arrayInfoBase.elementConfig = {
          color: rgbToHex(cfg.color, undefined),
          orientation: cfg.orientation as 'up' | 'down' | 'left' | 'right' | undefined,
          rotation: cfg.rotation,
          width: cfg.width ?? 1,
          height: cfg.height ?? 1,
          alpha: cfg.alpha,
          visible: cfg.visible,
        };
      } else if (this.elementType) {
        arrayInfoBase.elementType = this.elementType === 'rect' ? 'rectangle' : this.elementType;
        arrayInfoBase.elementConfig = { width: 1, height: 1 };
      } else {
        arrayInfoBase.value = typeof rawValue === 'number' || typeof rawValue === 'string' ? rawValue : 0;
        arrayInfoBase.varName = this.varName ?? '';
      }

      cells.push({
        cellId,
        data: { objectId: cellId, arrayInfo: arrayInfoBase, panelId: this.panelId },
      });
    }

    return { cells, nextIdx: idx };
  }
}

export const ARRAY_SCHEMA: ClassDoc = {
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
};

registerVisualElement('array', Array1D, ARRAY_SCHEMA);

export class Array2D implements VisualBuilderElement {
  type = 'array2d' as const;
  position: [number, number];
  visible: boolean = true;
  numRows: number;
  numCols: number;
  showIndex: boolean;
  varName?: string;
  alpha: number;
  panelId?: string;

  constructor(el: VisualBuilderElement) {
    this.position = el.position;
    this.numRows = Math.max(1, Math.min(50, el.numRows ?? 3));
    this.numCols = Math.max(1, Math.min(50, el.numCols ?? 3));
    this.showIndex = el.showIndex ?? true;
    this.varName = el.varName;
    this.alpha = el.alpha ?? 1;
    this.panelId = el.panelId;
  }

  draw(idxStart: number = 0, VB_PREFIX: string = 'vb-') {
    const cells: { cellId: string; data: Partial<CellData> }[] = [];
    let idx = idxStart;
    const { numRows, numCols, varName, panelId } = this;

    const arrayId = `${VB_PREFIX}array2d-${idx++}`;
    const showIndices = this.showIndex ?? true;

    for (let r = 0; r < numRows; r++) {
      for (let c = 0; c < numCols; c++) {
        const cellId = `${VB_PREFIX}${idx++}`;
        cells.push({
          cellId,
          data: {
            objectId: cellId,
            array2dInfo: {
              id: arrayId,
              row: r,
              col: c,
              numRows,
              numCols,
              value: undefined,
              varName: varName ?? '',
              showIndices,
            },
            panelId,
          },
        });
      }
    }

    return { cells, nextIdx: idx };
  }
}

export const ARRAY2D_SCHEMA: ClassDoc = {
  className: 'Array2D',
  constructorParams: 'var_name: str = "", element_type: str | None = None',
  docstring: 'Displays an array of values or visual shapes. Two approaches: (1) Dict config: set element_type="circle"/"rect"/"arrow", then arr[i] = {\'color\': (r,g,b), ...}. (2) Instance mode: arr[i] = Circle()/Rect()/Arrow() — shape position is controlled by the array, all other properties (color, size, alpha, V() bindings) come from the element. Elements with width/height > 1 shift subsequent cells accordingly.',
  properties: [
    { name: 'var_name', type: 'str', description: 'Name of the array variable (e.g. "arr", "nums"). Ignored when element_type is set.' },
    { name: 'element_type', type: 'str | None', description: 'Shape type for each cell: "circle", "rect", or "arrow". None for value arrays or instance mode (default).' },
    { name: 'position', type: 'tuple[int, int]', description: 'Top-left corner (row, col) of the first cell.' },
    { name: 'num_rows', type: 'int', description: 'Number of rows in the 2D array.' },
    { name: 'num_cols', type: 'int', description: 'Number of columns in the 2D array.' },
    { name: 'show_index', type: 'bool', description: 'Whether to show [i,j] index labels. Default True for value arrays, False for shape arrays.' },
    { name: 'visible', type: 'bool', description: 'Show or hide the array.' },
  ],
};

registerVisualElement('array2d', Array2D, ARRAY2D_SCHEMA);