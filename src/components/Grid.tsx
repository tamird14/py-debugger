import { useRef, useCallback, useMemo, useEffect, useState } from 'react';
import { GridCell } from './GridCell';
import type { CellPosition, CellData } from '../types/grid';
import { cellKey, getArrayOffset } from '../types/grid';

interface GridProps {
  cells: Map<string, CellData>;
  panels: Array<{
    id: string;
    row: number;
    col: number;
    width: number;
    height: number;
    title?: string;
    invalidReason?: string;
  }>;
  selectedCell: CellPosition | null;
  zoom: number;
  onSelectCell: (position: CellPosition | null) => void;
  onContextMenu: (e: React.MouseEvent, position: CellPosition) => void;
  onZoom: (delta: number) => void;
  onMoveCell: (from: CellPosition, to: CellPosition) => void;
  onMovePanel?: (panelId: string, to: CellPosition) => void;
  onPanelContextMenu?: (e: React.MouseEvent, panel: { id: string; row: number; col: number; width: number; height: number; title?: string }) => void;
}

const CELL_SIZE = 40;
const GRID_COLS = 50;
const GRID_ROWS = 50;

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
    start: CellPosition;
    rowAllowed: boolean;
    colAllowed: boolean;
    lastTarget?: CellPosition;
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
    (e: React.MouseEvent, row: number, col: number, cellData?: CellData) => {
      if (!cellData?.positionBinding) return;
      const rowAllowed = cellData.positionBinding.row.type === 'hardcoded';
      const colAllowed = cellData.positionBinding.col.type === 'hardcoded';
      if (!rowAllowed && !colAllowed) return;
      e.preventDefault();
      dragStateRef.current = { start: { row, col }, rowAllowed, colAllowed };
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
      const next = {
        row: dragState.rowAllowed ? target.row : dragState.start.row,
        col: dragState.colAllowed ? target.col : dragState.start.col,
      };
      dragStateRef.current = { ...dragState, lastTarget: next };
    };

    const handleMouseUp = () => {
      const dragState = dragStateRef.current;
      if (dragState?.committed) {
        dragStateRef.current = null;
        setIsDragging(false);
        return;
      }
      if (dragState?.lastTarget &&
        (dragState.lastTarget.row !== dragState.start.row || dragState.lastTarget.col !== dragState.start.col)) {
        dragStateRef.current = { ...dragState, committed: true };
        onMoveCell(dragState.start, dragState.lastTarget);
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
  const objectsToRender = useMemo(() => {
    const objects: Array<{
      key: string;
      row: number;
      col: number;
      cellData: CellData;
      isSelected: boolean;
      widthCells?: number;
      heightCells?: number;
      // For arrays, we need to know if this is the first cell
      isArrayStart?: boolean;
      arrayLength?: number;
    }> = [];

    const processedArrays = new Set<string>();

    for (const [key, cellData] of cells) {
      const [row, col] = key.split(',').map(Number);
      const isSelected = selectedCell?.row === row && selectedCell?.col === col;

      if (cellData.arrayInfo) {
        // Only process each array once (from its first cell)
        if (!processedArrays.has(cellData.arrayInfo.id)) {
          processedArrays.add(cellData.arrayInfo.id);

          // Count array length
          let arrayLength = 0;
          for (const [, cd] of cells) {
            if (cd.arrayInfo?.id === cellData.arrayInfo.id) {
              arrayLength++;
            }
          }

          // Find the first cell (index 0) position
          let startRow = row;
          let startCol = col;
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
            row: startRow,
            col: startCol,
            cellData,
            isSelected,
            isArrayStart: true,
            arrayLength,
          });
        }
      } else {
        const baseWidth = cellData.label?.width || cellData.shapeProps?.width || 1;
        const baseHeight = cellData.label?.height || cellData.shapeProps?.height || 1;
        const isUniformShape = cellData.shape === 'circle';
        const uniformSize = Math.max(baseWidth, baseHeight);
        const widthCells = isUniformShape ? uniformSize : baseWidth;
        const heightCells = isUniformShape ? uniformSize : baseHeight;
        objects.push({
          key,
          row,
          col,
          cellData,
          isSelected,
          widthCells,
          heightCells,
        });
      }
    }

    return objects;
  }, [cells, selectedCell]);

  // Render objects with absolute positioning for animation
  const renderedObjects = useMemo(() => {
    return objectsToRender.map((obj) => {
      if (obj.isArrayStart && obj.arrayLength) {
        // Render array as a group of cells
        const arrayCells: React.ReactNode[] = [];
        const direction = obj.cellData.arrayInfo?.direction || 'right';
        let minRowDelta = 0;
        let minColDelta = 0;
        let maxRowDelta = 0;
        let maxColDelta = 0;

        for (let i = 0; i < obj.arrayLength; i++) {
          const offset = getArrayOffset(direction, i);
          minRowDelta = Math.min(minRowDelta, offset.rowDelta);
          minColDelta = Math.min(minColDelta, offset.colDelta);
          maxRowDelta = Math.max(maxRowDelta, offset.rowDelta);
          maxColDelta = Math.max(maxColDelta, offset.colDelta);
        }

        for (let i = 0; i < obj.arrayLength; i++) {
          const offset = getArrayOffset(direction, i);
          const arrayRow = obj.row + offset.rowDelta;
          const arrayCol = obj.col + offset.colDelta;
          const arrayKey = cellKey(arrayRow, arrayCol);
          const arrayCellData = cells.get(arrayKey);

          if (arrayCellData) {
            const isCellSelected = selectedCell?.row === arrayRow && selectedCell?.col === arrayCol;

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
                onClick={() => onSelectCell({ row: arrayRow, col: arrayCol })}
                onContextMenu={(e) => handleCellContextMenu(e, arrayRow, arrayCol)}
                onMouseDown={(e) => handleDragStart(e, arrayRow, arrayCol, arrayCellData)}
              >
                <GridCell
                  row={arrayRow}
                  col={arrayCol}
                  cellData={arrayCellData}
                  isSelected={isCellSelected}
                  onSelect={() => onSelectCell({ row: arrayRow, col: arrayCol })}
                  size={CELL_SIZE}
                />
              </div>
            );
          }
        }

        const containerWidth = (maxColDelta - minColDelta + 1) * CELL_SIZE;
        const containerHeight = (maxRowDelta - minRowDelta + 1) * CELL_SIZE;

        return (
          <div
            key={obj.key}
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
      } else {
        const widthCells = Math.max(1, obj.widthCells || 1);
        const heightCells = Math.max(1, obj.heightCells || 1);
        // Single cell object (shape or int variable)
        return (
          <div
            key={obj.key}
            className="absolute transition-all duration-300 ease-out"
            style={{
              left: obj.col * CELL_SIZE,
              top: obj.row * CELL_SIZE,
              width: CELL_SIZE * widthCells,
              height: CELL_SIZE * heightCells,
              zIndex: 10,
            }}
            onClick={() => onSelectCell({ row: obj.row, col: obj.col })}
            onContextMenu={(e) => handleCellContextMenu(e, obj.row, obj.col)}
            onMouseDown={(e) => handleDragStart(e, obj.row, obj.col, obj.cellData)}
          >
            <GridCell
              row={obj.row}
              col={obj.col}
              cellData={obj.cellData}
              isSelected={obj.isSelected}
              onSelect={() => onSelectCell({ row: obj.row, col: obj.col })}
              size={CELL_SIZE}
              width={CELL_SIZE * widthCells}
              height={CELL_SIZE * heightCells}
            />
          </div>
        );
      }
    });
  }, [objectsToRender, cells, selectedCell, onSelectCell, handleCellContextMenu]);

  const renderedPanels = useMemo(() => {
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
      >
        {panel.title && (
          <span
            className="absolute -top-3 left-1 text-[10px] font-mono bg-slate-50 px-1 text-slate-600 hover:text-slate-900 hover:bg-blue-100 rounded"
            style={{
              pointerEvents: 'auto',
              cursor: 'grab',
              userSelect: 'none',
            }}
            onMouseDown={(e) => handlePanelDragStart(e, panel.id, panel.row, panel.col)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPanelContextMenu?.(e, panel);
            }}
          >
            {panel.title}
          </span>
        )}
      </div>
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

        {/* Panels layer */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="relative w-full h-full pointer-events-none">
            {renderedPanels}
          </div>
        </div>

        {/* Animated objects layer */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="relative w-full h-full pointer-events-auto">
            {renderedObjects}
          </div>
        </div>
      </div>
    </div>
  );
}
