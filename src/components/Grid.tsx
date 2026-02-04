import { useRef, useCallback, useMemo } from 'react';
import { GridCell } from './GridCell';
import type { CellPosition, CellData } from '../types/grid';
import { cellKey } from '../types/grid';

interface GridProps {
  cells: Map<string, CellData>;
  selectedCell: CellPosition | null;
  zoom: number;
  onSelectCell: (position: CellPosition | null) => void;
  onContextMenu: (e: React.MouseEvent, position: CellPosition) => void;
  onZoom: (delta: number) => void;
}

const CELL_SIZE = 40;
const GRID_COLS = 50;
const GRID_ROWS = 50;

export function Grid({
  cells,
  selectedCell,
  zoom,
  onSelectCell,
  onContextMenu,
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

  const handleCellContextMenu = useCallback(
    (e: React.MouseEvent, row: number, col: number) => {
      e.preventDefault();
      onSelectCell({ row, col });
      onContextMenu(e, { row, col });
    },
    [onSelectCell, onContextMenu]
  );

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
        objects.push({
          key,
          row,
          col,
          cellData,
          isSelected,
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

        for (let i = 0; i < obj.arrayLength; i++) {
          const arrayKey = cellKey(obj.row, obj.col + i);
          const arrayCellData = cells.get(arrayKey);

          if (arrayCellData) {
            const isCellSelected = selectedCell?.row === obj.row && selectedCell?.col === obj.col + i;

            arrayCells.push(
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: i * CELL_SIZE,
                  top: 0,
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                }}
                onClick={() => onSelectCell({ row: obj.row, col: obj.col + i })}
                onContextMenu={(e) => handleCellContextMenu(e, obj.row, obj.col + i)}
              >
                <GridCell
                  row={obj.row}
                  col={obj.col + i}
                  cellData={arrayCellData}
                  isSelected={isCellSelected}
                  onSelect={() => onSelectCell({ row: obj.row, col: obj.col + i })}
                  size={CELL_SIZE}
                />
              </div>
            );
          }
        }

        return (
          <div
            key={obj.key}
            className="absolute transition-all duration-300 ease-out"
            style={{
              left: obj.col * CELL_SIZE,
              top: obj.row * CELL_SIZE,
              width: obj.arrayLength * CELL_SIZE,
              height: CELL_SIZE,
              zIndex: 10,
            }}
          >
            {arrayCells}
          </div>
        );
      } else {
        // Single cell object (shape or int variable)
        return (
          <div
            key={obj.key}
            className="absolute transition-all duration-300 ease-out"
            style={{
              left: obj.col * CELL_SIZE,
              top: obj.row * CELL_SIZE,
              width: CELL_SIZE,
              height: CELL_SIZE,
              zIndex: 10,
            }}
            onClick={() => onSelectCell({ row: obj.row, col: obj.col })}
            onContextMenu={(e) => handleCellContextMenu(e, obj.row, obj.col)}
          >
            <GridCell
              row={obj.row}
              col={obj.col}
              cellData={obj.cellData}
              isSelected={obj.isSelected}
              onSelect={() => onSelectCell({ row: obj.row, col: obj.col })}
              size={CELL_SIZE}
            />
          </div>
        );
      }
    });
  }, [objectsToRender, cells, selectedCell, onSelectCell, handleCellContextMenu]);

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
