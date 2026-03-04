import { useRef, useCallback, useMemo, memo } from 'react';
import { GridCell } from './GridCell';
import type { CellData, OccupantInfo } from '../types/grid';
import type { ArrayCellSize } from '../types/grid';
import { cellKey, getArrayOffset, getAccumulatedArrayOffset } from '../types/grid';

// ── Constants ──────────────────────────────────────────────────────────────

const CELL_SIZE = 40;
const GRID_COLS = 50;
const GRID_ROWS = 50;

// ── Types ──────────────────────────────────────────────────────────────────

interface GridProps {
  cells: Map<string, CellData>;
  overlayCells?: Map<string, CellData>;
  occupancyMap?: Map<string, OccupantInfo[]>;
  panels: Array<PanelInfo>;
  zoom: number;
  onZoom: (delta: number) => void;
}

export interface PanelInfo {
  id: string;
  row: number;
  col: number;
  width: number;
  height: number;
  title?: string;
  invalidReason?: string;
}

/** Describes a renderable object on the grid (computed from cells map). */
interface RenderableObject {
  key: string;
  row: number;
  col: number;
  cellData: CellData;
  widthCells?: number;
  heightCells?: number;
  isArrayStart?: boolean;
  arrayLength?: number;
  is2DArrayStart?: boolean;
}

// ── Sub-components ─────────────────────────────────────────────────────────

/** Renders an array variable as a group of cells. */
const GridArrayObject = memo(function GridArrayObject({
  obj,
  cells,
}: {
  obj: RenderableObject;
  cells: Map<string, CellData>;
}) {
  const direction = obj.cellData.arrayInfo?.direction || 'right';
  const length = obj.arrayLength || 0;

  const perCellSizes: ArrayCellSize[] = [];
  for (let i = 0; i < length; i++) {
    const simpleOffset = getArrayOffset(direction, i);
    const r = obj.row + simpleOffset.rowDelta;
    const c = obj.col + simpleOffset.colDelta;
    const cd = cells.get(cellKey(r, c));
    if (cd?.arrayInfo?.elementConfig) {
      perCellSizes.push({
        width: cd.arrayInfo.elementConfig.width ?? 1,
        height: cd.arrayInfo.elementConfig.height ?? 1,
      });
    } else {
      perCellSizes.push({ width: 1, height: 1 });
    }
  }
  const useAccum = perCellSizes.some(s => s.width > 1 || s.height > 1);

  let minRowDelta = 0, minColDelta = 0, maxRowEnd = 0, maxColEnd = 0;
  for (let i = 0; i < length; i++) {
    const offset = useAccum ? getAccumulatedArrayOffset(direction, i, perCellSizes) : getArrayOffset(direction, i);
    const cellW = perCellSizes[i]?.width ?? 1;
    const cellH = perCellSizes[i]?.height ?? 1;
    minRowDelta = Math.min(minRowDelta, offset.rowDelta);
    minColDelta = Math.min(minColDelta, offset.colDelta);
    maxRowEnd = Math.max(maxRowEnd, offset.rowDelta + cellH);
    maxColEnd = Math.max(maxColEnd, offset.colDelta + cellW);
  }

  const arrayCells: React.ReactNode[] = [];
  for (let i = 0; i < length; i++) {
    const offset = useAccum ? getAccumulatedArrayOffset(direction, i, perCellSizes) : getArrayOffset(direction, i);
    const row = obj.row + offset.rowDelta;
    const col = obj.col + offset.colDelta;
    const cellData = cells.get(cellKey(row, col));
    if (!cellData) continue;

    if (cellData.arrayInfo?.elementConfig?.visible === false) continue;

    const cellW = perCellSizes[i]?.width ?? 1;
    const cellH = perCellSizes[i]?.height ?? 1;
    arrayCells.push(
      <div
        key={i}
        style={{
          position: 'absolute',
          left: (offset.colDelta - minColDelta) * CELL_SIZE,
          top: (offset.rowDelta - minRowDelta) * CELL_SIZE,
          width: cellW * CELL_SIZE,
          height: cellH * CELL_SIZE,
        }}
      >
        <GridCell
          row={row}
          col={col}
          cellData={cellData}
          size={CELL_SIZE}
          width={cellW * CELL_SIZE}
          height={cellH * CELL_SIZE}
        />
      </div>
    );
  }

  const containerWidth = (maxColEnd - minColDelta) * CELL_SIZE;
  const containerHeight = (maxRowEnd - minRowDelta) * CELL_SIZE;

  return (
    <div
      className="absolute transition-all duration-300 ease-out"
      style={{
        left: (obj.col + minColDelta) * CELL_SIZE,
        top: (obj.row + minRowDelta) * CELL_SIZE,
        width: containerWidth,
        height: containerHeight,
        zIndex: 10,
      }}
    >
      {arrayCells}
    </div>
  );
});

/** Renders a 2D array variable as a grid of cells. */
const GridArray2DObject = memo(function GridArray2DObject({
  obj,
  cells,
}: {
  obj: RenderableObject;
  cells: Map<string, CellData>;
}) {
  const info = obj.cellData.array2dInfo!;
  const { numRows, numCols } = info;

  const gridCells: React.ReactNode[] = [];
  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numCols; c++) {
      const row = obj.row + r;
      const col = obj.col + c;
      const cellData = cells.get(cellKey(row, col));
      if (!cellData) continue;
      gridCells.push(
        <div
          key={`${r}-${c}`}
          style={{
            position: 'absolute',
            left: c * CELL_SIZE,
            top: r * CELL_SIZE,
            width: CELL_SIZE,
            height: CELL_SIZE,
          }}
        >
          <GridCell
            row={row}
            col={col}
            cellData={cellData}
            size={CELL_SIZE}
            width={CELL_SIZE}
            height={CELL_SIZE}
          />
        </div>
      );
    }
  }

  return (
    <div
      className="absolute transition-all duration-300 ease-out"
      style={{
        left: obj.col * CELL_SIZE,
        top: obj.row * CELL_SIZE,
        width: numCols * CELL_SIZE,
        height: numRows * CELL_SIZE,
        zIndex: 10,
      }}
    >
      {gridCells}
    </div>
  );
});

/** Renders a single-origin object (shape, label, int variable). */
const GridSingleObject = memo(function GridSingleObject({
  obj,
}: {
  obj: RenderableObject;
}) {
  const widthCells = obj.widthCells ?? 1;
  const heightCells = obj.heightCells ?? 1;

  if (widthCells <= 0 || heightCells <= 0) return null;

  return (
    <div
      className="absolute transition-all duration-300 ease-out"
      style={{
        left: obj.col * CELL_SIZE,
        top: obj.row * CELL_SIZE,
        width: CELL_SIZE * widthCells,
        height: CELL_SIZE * heightCells,
        zIndex: 10,
      }}
    >
      <GridCell
        row={obj.row}
        col={obj.col}
        cellData={obj.cellData}
        size={CELL_SIZE}
        width={CELL_SIZE * widthCells}
        height={CELL_SIZE * heightCells}
      />
    </div>
  );
});

// ── Main Grid component ────────────────────────────────────────────────────

export function Grid({
  cells,
  overlayCells = new Map(),
  occupancyMap = new Map(),
  panels,
  zoom,
  onZoom,
}: GridProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        onZoom(delta);
      }
    },
    [onZoom]
  );

  const gridBackground = useMemo(() => {
    const result: React.ReactNode[] = [];
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const key = cellKey(row, col);
        const hasContent = occupancyMap.has(key);

        result.push(
          <div
            key={key}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 transition-colors"
            style={{
              width: CELL_SIZE,
              height: CELL_SIZE,
              zIndex: hasContent ? 0 : 1,
            }}
          />
        );
      }
    }
    return result;
  }, [occupancyMap]);

  const objectsToRender = useMemo((): RenderableObject[] => {
    const objects: RenderableObject[] = [];
    const processedArrays = new Set<string>();

    for (const [key, cellData] of cells) {
      const [row, col] = key.split(',').map(Number);

      if (cellData.arrayInfo) {
        if (processedArrays.has(cellData.arrayInfo.id)) continue;
        processedArrays.add(cellData.arrayInfo.id);

        let arrayLength = 0;
        for (const [, cd] of cells) {
          if (cd.arrayInfo?.id === cellData.arrayInfo.id) arrayLength++;
        }

        let startRow = row, startCol = col;
        for (const [k, cd] of cells) {
          if (cd.arrayInfo?.id === cellData.arrayInfo.id && cd.arrayInfo.index === 0) {
            const [r, c] = k.split(',').map(Number);
            startRow = r;
            startCol = c;
            break;
          }
        }

        objects.push({
          key: `array-${cellData.arrayInfo.id}`,
          row: startRow, col: startCol,
          cellData,
          isArrayStart: true, arrayLength,
        });
      } else if (cellData.array2dInfo) {
        if (processedArrays.has(cellData.array2dInfo.id)) continue;
        processedArrays.add(cellData.array2dInfo.id);

        let startRow = row, startCol = col;
        for (const [k, cd] of cells) {
          if (cd.array2dInfo?.id === cellData.array2dInfo.id && cd.array2dInfo.row === 0 && cd.array2dInfo.col === 0) {
            const [r, c] = k.split(',').map(Number);
            startRow = r;
            startCol = c;
            break;
          }
        }

        objects.push({
          key: `array2d-${cellData.array2dInfo.id}`,
          row: startRow, col: startCol,
          cellData,
          is2DArrayStart: true,
        });
      } else {
        const baseWidth = cellData.bounds?.width ?? 1;
        const baseHeight = cellData.bounds?.height ?? 1;
        objects.push({
          key, row, col, cellData,
          widthCells: baseWidth,
          heightCells: baseHeight,
        });
      }
    }

    for (const [key, cellData] of overlayCells) {
      const [row, col] = key.split(',').map(Number);
      const baseWidth = cellData.bounds?.width ?? 1;
      const baseHeight = cellData.bounds?.height ?? 1;
      objects.push({
        key: 'overlay-' + key,
        row,
        col,
        cellData,
        widthCells: baseWidth,
        heightCells: baseHeight,
      });
    }

    objects.sort((a, b) => (a.cellData.zOrder ?? 0) - (b.cellData.zOrder ?? 0));
    return objects;
  }, [cells, overlayCells]);

  const renderedObjects = useMemo(() => {
    return objectsToRender.map((obj) =>
      obj.isArrayStart && obj.arrayLength ? (
        <GridArrayObject
          key={obj.key}
          obj={obj}
          cells={cells}
        />
      ) : obj.is2DArrayStart ? (
        <GridArray2DObject
          key={obj.key}
          obj={obj}
          cells={cells}
        />
      ) : (
        <GridSingleObject
          key={obj.key}
          obj={obj}
        />
      )
    );
  }, [objectsToRender, cells]);

  const renderedPanelBackgrounds = useMemo(() => {
    return panels.map((panel) => (
      <div
        key={panel.id}
        className={`absolute border-2 border-dashed bg-slate-50/50 dark:bg-slate-800/50 transition-all duration-300 ease-out ${
          panel.invalidReason ? 'opacity-50 grayscale' : ''
        }`}
        style={{
          left: panel.col * CELL_SIZE,
          top: panel.row * CELL_SIZE,
          width: panel.width * CELL_SIZE,
          height: panel.height * CELL_SIZE,
          zIndex: 5,
        }}
      />
    ));
  }, [panels]);

  const renderedPanelHandles = useMemo(() => {
    return panels.map((panel) => (
      <span
        key={panel.id}
        className={`absolute text-[10px] font-mono bg-slate-50 dark:bg-slate-700 px-1 rounded ${
          panel.title
            ? 'text-slate-600 dark:text-slate-300'
            : 'text-slate-400 dark:text-slate-500'
        }`}
        style={{
          left: panel.col * CELL_SIZE + 4,
          top: panel.row * CELL_SIZE,
          transform: 'translateY(-100%)',
          userSelect: 'none',
          zIndex: 20,
        }}
      >
        {panel.title || '⋮⋮'}
      </span>
    ));
  }, [panels]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-auto bg-gray-100 dark:bg-gray-900"
      onWheel={handleWheel}
    >
      <div
        className="origin-top-left relative"
        style={{
          transform: `scale(${zoom})`,
          width: CELL_SIZE * GRID_COLS,
          minHeight: CELL_SIZE * GRID_ROWS,
        }}
      >
        {/* Background grid */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${GRID_COLS}, ${CELL_SIZE}px)`,
            gridTemplateRows: `repeat(${GRID_ROWS}, ${CELL_SIZE}px)`,
          }}
        >
          {gridBackground}
        </div>

        {/* Panel backgrounds layer (below objects) */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="relative w-full h-full pointer-events-none">
            {renderedPanelBackgrounds}
          </div>
        </div>

        {/* Objects layer */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="relative w-full h-full pointer-events-none">
            {renderedObjects}
          </div>
        </div>

        {/* Panel handles layer */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="relative w-full h-full">
            {renderedPanelHandles}
          </div>
        </div>
      </div>
    </div>
  );
}
