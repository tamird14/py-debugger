import type { VisualBuilderElementBase } from "../../api/visualBuilder";
import { rgbToHex } from "../../api/visualBuilder";
import type { RenderableObjectData, CellStyle, PanelStyle } from "./grid";
import type { ClassDoc } from "../../api/visualBuilder";
import { registerVisualElement } from "./elementRegistry";
import { getArrayOffset } from "./grid";

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

// ========================= Array Panel Info =========================

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

// ========================= Array1DCell =========================

export class Array1DCell {
  type = 'array1dcell' as const;
  arrayId: string;
  index: number;
  direction: 'right' | 'left' | 'down' | 'up';
  showIndex: boolean;
  varName?: string;
  value?: string | number;
  style?: CellStyle;

  constructor(opts: {
    arrayId: string;
    index: number;
    direction: 'right' | 'left' | 'down' | 'up';
    showIndex: boolean;
    varName?: string;
    value?: string | number;
    style?: CellStyle;
  }) {
    this.arrayId = opts.arrayId;
    this.index = opts.index;
    this.direction = opts.direction;
    this.showIndex = opts.showIndex;
    this.varName = opts.varName;
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

// ========================= Array2DCell =========================

export class Array2DCell {
  type = 'array2dcell' as const;
  arrayId: string;
  row: number;
  col: number;
  numRows: number;
  numCols: number;
  varName?: string;
  showIndices: boolean;
  value?: string | number;
  style?: CellStyle;

  constructor(opts: {
    arrayId: string;
    row: number;
    col: number;
    numRows: number;
    numCols: number;
    varName?: string;
    showIndices: boolean;
    value?: string | number;
    style?: CellStyle;
  }) {
    this.arrayId = opts.arrayId;
    this.row = opts.row;
    this.col = opts.col;
    this.numRows = opts.numRows;
    this.numCols = opts.numCols;
    this.varName = opts.varName;
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

// ========================= Array1D (Panel) =========================

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
        direction: this.direction,
        showIndex: this.showIndex,
        varName: this.varName,
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

export const ARRAY_SCHEMA: ClassDoc = {
  className: 'Array',
  constructorParams: 'var_name: str = ""',
  docstring: 'Displays an array of values as square cells on the grid.',
  properties: [
    { name: 'var_name', type: 'str', description: 'Name of the array variable (e.g. "arr", "nums").' },
    { name: 'position', type: 'tuple[int, int]', description: 'Top-left corner (row, col) of the first cell.' },
    { name: 'direction', type: 'str', description: '"right", "left", "down", or "up" — layout direction.' },
    { name: 'length', type: 'int', description: 'Number of cells (default 5).' },
    { name: 'show_index', type: 'bool', description: 'Whether to show [i] index labels. Default True.' },
    { name: 'visible', type: 'bool', description: 'Show or hide the array.' },
  ],
};

registerVisualElement('array', Array1D, ARRAY_SCHEMA);

// ========================= Array2D (Panel) =========================

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
          varName: varName ?? '',
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

export const ARRAY2D_SCHEMA: ClassDoc = {
  className: 'Array2D',
  constructorParams: 'var_name: str = ""',
  docstring: 'Displays a 2D array of values as a grid of square cells.',
  properties: [
    { name: 'var_name', type: 'str', description: 'Name of the 2D array variable.' },
    { name: 'position', type: 'tuple[int, int]', description: 'Top-left corner (row, col).' },
    { name: 'num_rows', type: 'int', description: 'Number of rows.' },
    { name: 'num_cols', type: 'int', description: 'Number of columns.' },
    { name: 'show_index', type: 'bool', description: 'Whether to show [i][j] index labels. Default True.' },
    { name: 'visible', type: 'bool', description: 'Show or hide the array.' },
  ],
};

registerVisualElement('array2d', Array2D, ARRAY2D_SCHEMA);
