import type { VisualBuilderElement } from "./visualBuilder";
import type { CellData } from "./grid";

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
          color: cfg.color ? this.rgbToHex(cfg.color) : undefined,
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

  private rgbToHex(rgb?: [number, number, number], defaultColor: string = '#000000') {
    if (!rgb) return defaultColor;
    return '#' + rgb.map(x => Math.max(0, Math.min(255, Math.floor(x))).toString(16).padStart(2, '0')).join('');
  }
}

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