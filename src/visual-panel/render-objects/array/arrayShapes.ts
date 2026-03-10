import type { VisualBuilderElementBase } from "../../../api/visualBuilder";
import { rgbToHex } from "../../../api/visualBuilder";
import type { RenderableObjectData, CellStyle, PanelStyle } from "../../types/grid";
import type { ObjDoc } from "../../../api/visualBuilder";
import { registerVisualElement } from "../../types/elementRegistry";
import { getArrayOffset } from "../../types/grid";

export const PANEL_STYLE_1D: PanelStyle = {
  borderClass: 'border-2 border-amber-400 dark:border-amber-600',
  backgroundClass: 'bg-amber-50/50 dark:bg-amber-900/30',
  titleBgClass: 'bg-amber-50 dark:bg-amber-900',
  titleTextClass: 'text-amber-700 dark:text-amber-300',
};

export const PANEL_STYLE_2D: PanelStyle = {
  borderClass: 'border-2 border-violet-400 dark:border-violet-600',
  backgroundClass: 'bg-violet-50/50 dark:bg-violet-900/30',
  titleBgClass: 'bg-violet-50 dark:bg-violet-900',
  titleTextClass: 'text-violet-700 dark:text-violet-300',
};

export interface ArrayPanelInfo {
  id: string;
  width: number;
  height: number;
  title?: string;
  panelStyle: PanelStyle;
}

export interface ArrayDrawResult {
  panel: ArrayPanelInfo;
  panelOffset: { row: number; col: number };
  cells: { cellId: string; data: Partial<RenderableObjectData>; position: [number, number] }[];
  nextIdx: number;
}

export class Array1DCell {
  type = 'array1dcell' as const;
  arrayId: string;
  index: number;
  showIndex: boolean;
  value?: string | number;
  style?: CellStyle;

  constructor(opts: {
    arrayId: string;
    index: number;
    showIndex: boolean;
    value?: string | number;
    style?: CellStyle;
  }) {
    this.arrayId = opts.arrayId;
    this.index = opts.index;
    this.showIndex = opts.showIndex;
    this.value = opts.value;
    this.style = opts.style;
  }

  draw(): Partial<RenderableObjectData> {
    return {
      elementInfo: this as any,
      style: this.style,
    };
  }
}

export class Array2DCell {
  type = 'array2dcell' as const;
  arrayId: string;
  row: number;
  col: number;
  numRows: number;
  numCols: number;
  showIndices: boolean;
  value?: string | number;
  style?: CellStyle;

  constructor(opts: {
    arrayId: string;
    row: number;
    col: number;
    numRows: number;
    numCols: number;
    showIndices: boolean;
    value?: string | number;
    style?: CellStyle;
  }) {
    this.arrayId = opts.arrayId;
    this.row = opts.row;
    this.col = opts.col;
    this.numRows = opts.numRows;
    this.numCols = opts.numCols;
    this.showIndices = opts.showIndices;
    this.value = opts.value;
    this.style = opts.style;
  }

  draw(): Partial<RenderableObjectData> {
    return {
      elementInfo: this as any,
      style: this.style,
    };
  }
}

export class Array1D implements VisualBuilderElementBase {
  type = 'array' as const;
  position: [number, number];
  visible: boolean = true;
  length: number;
  direction: 'right' | 'left' | 'down' | 'up';
  values: (number | string)[];
  showIndex: boolean;
  varName?: string;
  alpha: number;
  panelId?: string;
  style?: CellStyle;

  constructor(el: any) {
    this.position = el.position;
    this.length = Math.max(1, Math.min(50, el.length ?? 5));
    this.direction = (['left', 'down', 'up'].includes(el.direction!) ? el.direction! : 'right') as 'right' | 'left' | 'down' | 'up';
    this.values = (el.values ?? []).map((v: unknown) =>
      typeof v === 'number' || typeof v === 'string' ? v : 0
    );
    this.showIndex = el.showIndex ?? true;
    this.varName = el.varName;
    this.alpha = el.alpha ?? 1;
    this.panelId = el.panelId;

    const color = el.color ? rgbToHex(el.color) : undefined;
    if (color || this.alpha !== 1) {
      this.style = { color, opacity: this.alpha };
    }
  }

  draw(idxStart: number = 0, VB_PREFIX: string = 'vb-'): ArrayDrawResult {
    let idx = idxStart;
    const panelId = `${VB_PREFIX}array-panel-${idx++}`;

    const isHorizontal = this.direction === 'right' || this.direction === 'left';
    const panelWidth = isHorizontal ? this.length : 1;
    const panelHeight = isHorizontal ? 1 : this.length;

    let panelRowOffset = 0;
    let panelColOffset = 0;
    if (this.direction === 'left') panelColOffset = -(this.length - 1);
    if (this.direction === 'up') panelRowOffset = -(this.length - 1);

    const cells: ArrayDrawResult['cells'] = [];

    for (let i = 0; i < this.length; i++) {
      const offset = getArrayOffset(this.direction, i);
      const cellRow = offset.rowDelta - panelRowOffset;
      const cellCol = offset.colDelta - panelColOffset;

      const cell = new Array1DCell({
        arrayId: panelId,
        index: i,
        showIndex: this.showIndex,
        value: this.values[i],
        style: this.style,
      });

      cells.push({
        cellId: `${VB_PREFIX}${idx++}`,
        data: cell.draw(),
        position: [cellRow, cellCol],
      });
    }

    return {
      panel: {
        id: panelId,
        width: panelWidth,
        height: panelHeight,
        title: this.varName,
        panelStyle: PANEL_STYLE_1D,
      },
      panelOffset: { row: panelRowOffset, col: panelColOffset },
      cells,
      nextIdx: idx,
    };
  }
}

export const ARRAY_SCHEMA: ObjDoc = {
  objName: 'Array',
  docstring: 'Displays an array of values as square cells on the grid.',
  properties: [
    { name: 'var_name', type: 'str', description: 'Name of the array variable (e.g. "arr", "nums").', default: '""' },
    { name: 'position', type: 'tuple[int, int]', description: 'Top-left corner (row, col) of the first cell.', default: '(0, 0)' },
    { name: 'direction', type: 'str', description: '"right", "left", "down", or "up" — layout direction.', default: '"right"' },
    { name: 'length', type: 'int', description: 'Number of cells (read-only, derived from arr).', default: '5' },
    { name: 'show_index', type: 'bool', description: 'Whether to show [i] index labels.', default: 'True' },
    { name: 'visible', type: 'bool', description: 'Show or hide the array.', default: 'True' },
  ],
};

registerVisualElement('array', Array1D, ARRAY_SCHEMA);

export class Array2D implements VisualBuilderElementBase {
  type = 'array2d' as const;
  position: [number, number];
  visible: boolean = true;
  numRows: number;
  numCols: number;
  showIndex: boolean;
  varName?: string;
  alpha: number;
  panelId?: string;
  style?: CellStyle;

  constructor(el: any) {
    this.position = el.position;
    this.numRows = Math.max(1, Math.min(50, el.numRows ?? 3));
    this.numCols = Math.max(1, Math.min(50, el.numCols ?? 3));
    this.showIndex = el.showIndex ?? true;
    this.varName = el.varName;
    this.alpha = el.alpha ?? 1;
    this.panelId = el.panelId;

    const color = el.color ? rgbToHex(el.color) : undefined;
    if (color || this.alpha !== 1) {
      this.style = { color, opacity: this.alpha };
    }
  }

  draw(idxStart: number = 0, VB_PREFIX: string = 'vb-'): ArrayDrawResult {
    let idx = idxStart;
    const { numRows, numCols, varName } = this;
    const panelId = `${VB_PREFIX}array2d-panel-${idx++}`;
    const showIndices = this.showIndex ?? true;

    const cells: ArrayDrawResult['cells'] = [];

    for (let r = 0; r < numRows; r++) {
      for (let c = 0; c < numCols; c++) {
        const cell = new Array2DCell({
          arrayId: panelId,
          row: r,
          col: c,
          numRows,
          numCols,
          showIndices,
          style: this.style,
        });

        cells.push({
          cellId: `${VB_PREFIX}${idx++}`,
          data: cell.draw(),
          position: [r, c],
        });
      }
    }

    return {
      panel: {
        id: panelId,
        width: numCols,
        height: numRows,
        title: varName,
        panelStyle: PANEL_STYLE_2D,
      },
      panelOffset: { row: 0, col: 0 },
      cells,
      nextIdx: idx,
    };
  }
}

export const ARRAY2D_SCHEMA: ObjDoc = {
  objName: 'Array2D',
  docstring: 'Displays a 2D array of values as a grid of square cells.',
  properties: [
    { name: 'var_name', type: 'str', description: 'Name of the 2D array variable.', default: '""' },
    { name: 'position', type: 'tuple[int, int]', description: 'Top-left corner (row, col).', default: '(0, 0)' },
    { name: 'num_rows', type: 'int', description: 'Number of rows.', default: '3' },
    { name: 'num_cols', type: 'int', description: 'Number of columns.', default: '3' },
    { name: 'show_index', type: 'bool', description: 'Whether to show [i][j] index labels.', default: 'True' },
    { name: 'visible', type: 'bool', description: 'Show or hide the array.', default: 'True' },
  ],
};

registerVisualElement('array2d', Array2D, ARRAY2D_SCHEMA);
