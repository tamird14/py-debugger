import { useRef, useCallback, useMemo, useEffect, useState, memo } from 'react';
import { GridCell } from './GridCell';
import type { CellPosition, CellData } from '../types/grid';
import { cellKey, getArrayOffset } from '../types/grid';

// ── Constants ──────────────────────────────────────────────────────────────

const CELL_SIZE = 40;
const GRID_COLS = 50;
const GRID_ROWS = 50;

// ── Types ──────────────────────────────────────────────────────────────────

interface GridProps {
  cells: Map<string, CellData>;
  panels: Array<PanelInfo>;
  selectedCell: CellPosition | null;
  zoom: number;
  onSelectCell: (position: CellPosition | null) => void;
  onContextMenu: (e: React.MouseEvent, position: CellPosition) => void;
  onZoom: (delta: number) => void;
  onMoveCell: (from: CellPosition, to: CellPosition) => void;
  onMovePanel?: (panelId: string, to: CellPosition) => void;
  onPanelContextMenu?: (e: React.MouseEvent, panel: PanelInfo) => void;
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
  isSelected: boolean;
  widthCells?: number;
  heightCells?: number;
  isArrayStart?: boolean;
  arrayLength?: number;
}

/** Shared event handlers passed to object sub-components. */
interface CellEventHandlers {
  onSelectCell: (position: CellPosition | null) => void;
  onContextMenu: (e: React.MouseEvent, row: number, col: number) => void;
  onDragStart: (e: React.MouseEvent, grabRow: number, grabCol: number, originRow: number, originCol: number, cellData?: CellData) => void;
}

// ── Sub-components ─────────────────────────────────────────────────────────

/** Renders an array variable as a group of individually-interactive cells. */
const GridArrayObject = memo(function GridArrayObject({
  obj,
  cells,
  selectedCell,
  handlers,
}: {
  obj: RenderableObject;
  cells: Map<string, CellData>;
  selectedCell: CellPosition | null;
  handlers: CellEventHandlers;
}) {
  const direction = obj.cellData.arrayInfo?.direction || 'right';
  const length = obj.arrayLength || 0;

  // Compute bounding box across all array offsets
  let minRowDelta = 0, minColDelta = 0, maxRowDelta = 0, maxColDelta = 0;
  for (let i = 0; i < length; i++) {
    const offset = getArrayOffset(direction, i);
    minRowDelta = Math.min(minRowDelta, offset.rowDelta);
    minColDelta = Math.min(minColDelta, offset.colDelta);
    maxRowDelta = Math.max(maxRowDelta, offset.rowDelta);
    maxColDelta = Math.max(maxColDelta, offset.colDelta);
  }

  // Build per-cell wrappers
  const arrayCells: React.ReactNode[] = [];
  for (let i = 0; i < length; i++) {
    const offset = getArrayOffset(direction, i);
    const row = obj.row + offset.rowDelta;
    const col = obj.col + offset.colDelta;
    const cellData = cells.get(cellKey(row, col));
    if (!cellData) continue;

    const isSelected = selectedCell?.row === row && selectedCell?.col === col;
    arrayCells.push(
      <div
        key={i}
        style={{
          position: 'absolute',
          left: (offset.colDelta - minColDelta) * CELL_SIZE,
          top: (offset.rowDelta - minRowDelta) * CELL_SIZE,
          width: CELL_SIZE,
          height: CELL_SIZE,
        }}
        onClick={() => handlers.onSelectCell({ row, col })}
        onContextMenu={(e) => handlers.onContextMenu(e, row, col)}
        onMouseDown={(e) => handlers.onDragStart(e, row, col, obj.row, obj.col, cellData)}
      >
        <GridCell
          row={row}
          col={col}
          cellData={cellData}
          isSelected={isSelected}
          onSelect={() => handlers.onSelectCell({ row, col })}
          size={CELL_SIZE}
        />
      </div>
    );
  }

  const containerWidth = (maxColDelta - minColDelta + 1) * CELL_SIZE;
  const containerHeight = (maxRowDelta - minRowDelta + 1) * CELL_SIZE;

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

/** Renders a single-origin object (shape, label, int variable). */
const GridSingleObject = memo(function GridSingleObject({
  obj,
  handlers,
}: {
  obj: RenderableObject;
  handlers: CellEventHandlers;
}) {
  const widthCells = Math.max(1, obj.widthCells || 1);
  const heightCells = Math.max(1, obj.heightCells || 1);

  // Compute the actual sub-cell the user interacted with from the mouse offset
  const getSubCell = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    const subCol = Math.floor(localX / CELL_SIZE);
    const subRow = Math.floor(localY / CELL_SIZE);
    return {
      row: obj.row + Math.min(subRow, heightCells - 1),
      col: obj.col + Math.min(subCol, widthCells - 1),
    };
  };

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
      onClick={(e) => {
        const cell = getSubCell(e);
        handlers.onSelectCell(cell);
      }}
      onContextMenu={(e) => {
        const cell = getSubCell(e);
        handlers.onContextMenu(e, cell.row, cell.col);
      }}
      onMouseDown={(e) => {
        const cell = getSubCell(e);
        handlers.onDragStart(e, cell.row, cell.col, obj.row, obj.col, obj.cellData);
      }}
    >
      <GridCell
        row={obj.row}
        col={obj.col}
        cellData={obj.cellData}
        isSelected={obj.isSelected}
        onSelect={() => handlers.onSelectCell({ row: obj.row, col: obj.col })}
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
  panels,
  selectedCell,
  zoom,
  onSelectCell,
  onContextMenu,
  onZoom,
  onMoveCell,
  onMovePanel,
  onPanelContextMenu,
}: GridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    objectOrigin: CellPosition;     // the object's origin cell
    grabOffset: CellPosition;       // offset from origin to where the user grabbed
    rowAllowed: boolean;
    colAllowed: boolean;
    lastTarget?: CellPosition;      // last mouse position (raw grid cell)
    committed?: boolean;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Panel drag state
  const panelDragRef = useRef<{
    panelId: string;
    startCell: CellPosition;
    lastTarget?: CellPosition;
  } | null>(null);
  const [isPanelDragging, setIsPanelDragging] = useState(false);

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

  const handleCellContextMenu = useCallback(
    (e: React.MouseEvent, row: number, col: number) => {
      e.preventDefault();
      onSelectCell({ row, col });
      onContextMenu(e, { row, col });
    },
    [onSelectCell, onContextMenu]
  );

  const getCellFromPointer = useCallback(
    (clientX: number, clientY: number): CellPosition | null => {
      const container = containerRef.current;
      if (!container) return null;
      const rect = container.getBoundingClientRect();
      const x = (clientX - rect.left + container.scrollLeft) / zoom;
      const y = (clientY - rect.top + container.scrollTop) / zoom;
      const col = Math.floor(x / CELL_SIZE);
      const row = Math.floor(y / CELL_SIZE);
      if (row < 0 || col < 0 || row >= GRID_ROWS || col >= GRID_COLS) return null;
      return { row, col };
    },
    [zoom]
  );

  const handleDragStart = useCallback(
    (e: React.MouseEvent, grabRow: number, grabCol: number, originRow: number, originCol: number, cellData?: CellData) => {
      if (!cellData?.positionBinding) return;
      const rowAllowed = cellData.positionBinding.row.type === 'hardcoded';
      const colAllowed = cellData.positionBinding.col.type === 'hardcoded';
      if (!rowAllowed && !colAllowed) return;
      e.preventDefault();
      e.stopPropagation();
      dragStateRef.current = {
        objectOrigin: { row: originRow, col: originCol },
        grabOffset: { row: grabRow - originRow, col: grabCol - originCol },
        rowAllowed,
        colAllowed,
      };
      setIsDragging(true);
    },
    []
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;
      const target = getCellFromPointer(e.clientX, e.clientY);
      if (!target) return;
      dragStateRef.current = { ...dragState, lastTarget: target };
    };

    const handleMouseUp = () => {
      const dragState = dragStateRef.current;
      if (dragState?.committed) {
        dragStateRef.current = null;
        setIsDragging(false);
        return;
      }
      if (dragState?.lastTarget) {
        // Compute where the object origin should land:
        // mouseTarget minus the grab offset = new origin position
        const newOrigin = {
          row: dragState.rowAllowed
            ? dragState.lastTarget.row - dragState.grabOffset.row
            : dragState.objectOrigin.row,
          col: dragState.colAllowed
            ? dragState.lastTarget.col - dragState.grabOffset.col
            : dragState.objectOrigin.col,
        };
        if (newOrigin.row !== dragState.objectOrigin.row || newOrigin.col !== dragState.objectOrigin.col) {
          dragStateRef.current = { ...dragState, committed: true };
          onMoveCell(dragState.objectOrigin, newOrigin);
        }
      }
      dragStateRef.current = null;
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [getCellFromPointer, isDragging, onMoveCell]);

  // Panel drag: start handler
  const handlePanelDragStart = useCallback(
    (e: React.MouseEvent, panelId: string, panelRow: number, panelCol: number) => {
      e.preventDefault();
      e.stopPropagation();
      panelDragRef.current = {
        panelId,
        startCell: { row: panelRow, col: panelCol },
      };
      setIsPanelDragging(true);
    },
    []
  );

  // Panel drag: mousemove / mouseup effect
  useEffect(() => {
    if (!isPanelDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const state = panelDragRef.current;
      if (!state) return;
      const target = getCellFromPointer(e.clientX, e.clientY);
      if (!target) return;
      panelDragRef.current = { ...state, lastTarget: target };
    };

    const handleMouseUp = () => {
      const state = panelDragRef.current;
      if (state?.lastTarget && onMovePanel &&
        (state.lastTarget.row !== state.startCell.row || state.lastTarget.col !== state.startCell.col)) {
        onMovePanel(state.panelId, state.lastTarget);
      }
      panelDragRef.current = null;
      setIsPanelDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [getCellFromPointer, isPanelDragging, onMovePanel]);

  // Background grid cells (empty cells for selection and context menu)
  const gridBackground = useMemo(() => {
    const result: React.ReactNode[] = [];
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const key = cellKey(row, col);
        const isSelected =
          selectedCell?.row === row && selectedCell?.col === col;
        const hasContent = cells.has(key);

        result.push(
          <div
            key={key}
            className={`
              border border-gray-300 cursor-pointer transition-colors
              ${isSelected ? 'bg-blue-100 border-blue-500 border-2' : 'bg-white hover:bg-gray-50'}
            `}
            style={{
              width: CELL_SIZE,
              height: CELL_SIZE,
              // Make background cells clickable but content renders on top
              zIndex: hasContent ? 0 : 1,
            }}
            onClick={() => onSelectCell({ row, col })}
            onContextMenu={(e) => handleCellContextMenu(e, row, col)}
          />
        );
      }
    }
    return result;
  }, [selectedCell, cells, onSelectCell, handleCellContextMenu]);

  // Collect unique objects for animated rendering
  // Group array cells by their array ID to render them together
  const objectsToRender = useMemo((): RenderableObject[] => {
    const objects: RenderableObject[] = [];
    const processedArrays = new Set<string>();

    for (const [key, cellData] of cells) {
      const [row, col] = key.split(',').map(Number);
      const isSelected = selectedCell?.row === row && selectedCell?.col === col;

      if (cellData.arrayInfo) {
        if (processedArrays.has(cellData.arrayInfo.id)) continue;
        processedArrays.add(cellData.arrayInfo.id);

        // Count array length
        let arrayLength = 0;
        for (const [, cd] of cells) {
          if (cd.arrayInfo?.id === cellData.arrayInfo.id) arrayLength++;
        }

        // Find the first cell (index 0) position
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
          cellData, isSelected,
          isArrayStart: true, arrayLength,
        });
      } else {
        const baseWidth = cellData.label?.width || cellData.shapeProps?.width || 1;
        const baseHeight = cellData.label?.height || cellData.shapeProps?.height || 1;
        const isUniformShape = cellData.shape === 'circle';
        const uniformSize = Math.max(baseWidth, baseHeight);
        objects.push({
          key, row, col, cellData, isSelected,
          widthCells: isUniformShape ? uniformSize : baseWidth,
          heightCells: isUniformShape ? uniformSize : baseHeight,
        });
      }
    }

    return objects;
  }, [cells, selectedCell]);

  // Stable event handlers object for sub-components
  const cellEventHandlers = useMemo((): CellEventHandlers => ({
    onSelectCell,
    onContextMenu: handleCellContextMenu,
    onDragStart: handleDragStart,
  }), [onSelectCell, handleCellContextMenu, handleDragStart]);

  // Render objects via dedicated sub-components
  const renderedObjects = useMemo(() => {
    return objectsToRender.map((obj) =>
      obj.isArrayStart && obj.arrayLength ? (
        <GridArrayObject
          key={obj.key}
          obj={obj}
          cells={cells}
          selectedCell={selectedCell}
          handlers={cellEventHandlers}
        />
      ) : (
        <GridSingleObject
          key={obj.key}
          obj={obj}
          handlers={cellEventHandlers}
        />
      )
    );
  }, [objectsToRender, cells, selectedCell, cellEventHandlers]);

  // Panel visuals (dashed border + background) - rendered below objects
  const renderedPanelBackgrounds = useMemo(() => {
    return panels.map((panel) => (
      <div
        key={panel.id}
        className={`absolute border-2 border-dashed bg-slate-50/50 transition-all duration-300 ease-out ${
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

  // Panel drag handles - rendered above objects so they're always reachable
  const renderedPanelHandles = useMemo(() => {
    return panels.map((panel) => (
      <span
        key={panel.id}
        className={`absolute text-[10px] font-mono bg-slate-50 px-1 rounded ${
          panel.title
            ? 'text-slate-600 hover:text-slate-900 hover:bg-blue-100'
            : 'text-slate-400 hover:text-slate-600 hover:bg-blue-100'
        }`}
        style={{
          left: panel.col * CELL_SIZE + 4,
          top: panel.row * CELL_SIZE,
          transform: 'translateY(-100%)',
          pointerEvents: 'auto',
          cursor: 'grab',
          userSelect: 'none',
          zIndex: 20,
        }}
        onMouseDown={(e) => handlePanelDragStart(e, panel.id, panel.row, panel.col)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onPanelContextMenu?.(e, panel);
        }}
      >
        {panel.title || '⋮⋮'}
      </span>
    ));
  }, [panels, handlePanelDragStart, onPanelContextMenu]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-auto bg-gray-100"
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

        {/* Animated objects layer */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="relative w-full h-full pointer-events-auto">
            {renderedObjects}
          </div>
        </div>

        {/* Panel drag handles layer (above objects, always reachable) */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="relative w-full h-full">
            {renderedPanelHandles}
          </div>
        </div>
      </div>
    </div>
  );
}
