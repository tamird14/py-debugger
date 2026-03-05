import { useRef, useCallback, useMemo, memo, forwardRef, useImperativeHandle } from 'react';
import { GridCell } from './GridCell';
import type { RenderableObjectData, OccupantInfo, PanelStyle } from '../types/grid';
import { cellKey, PANEL_STYLE_DEFAULT } from '../types/grid';

// ── Constants ──────────────────────────────────────────────────────────────

export const CELL_SIZE = 40;
const GRID_COLS = 50;
const GRID_ROWS = 50;

// ── Types ──────────────────────────────────────────────────────────────────

interface GridProps {
  cells: Map<string, RenderableObjectData>;
  overlayCells?: Map<string, RenderableObjectData>;
  occupancyMap?: Map<string, OccupantInfo[]>;
  panels: Array<PanelInfo>;
  zoom: number;
  onZoom: (delta: number) => void;
}

export interface GridHandle {
  alignGrid: () => void;
  captureElement: () => HTMLDivElement | null;
}

export interface PanelInfo {
  id: string;
  row: number;
  col: number;
  width: number;
  height: number;
  title?: string;
  panelStyle?: PanelStyle;
  invalidReason?: string;
}

interface RenderableObject {
  key: string;
  row: number;
  col: number;
  cellData: RenderableObjectData;
  widthCells: number;
  heightCells: number;
}

// ── Sub-components ─────────────────────────────────────────────────────────

const GridSingleObject = memo(function GridSingleObject({
  obj,
}: {
  obj: RenderableObject;
}) {
  const { widthCells, heightCells } = obj;
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

export const Grid = forwardRef<GridHandle, GridProps>(function Grid({
  cells,
  overlayCells = new Map(),
  occupancyMap = new Map(),
  panels,
  zoom,
  onZoom,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridContentRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    alignGrid: () => {
      const container = containerRef.current;
      if (!container) return;
      const scaledCellSize = CELL_SIZE * zoom;
      const offsetLeft = container.scrollLeft % scaledCellSize;
      const offsetTop = container.scrollTop % scaledCellSize;
      container.scrollTo({
        left: container.scrollLeft - offsetLeft,
        top: container.scrollTop - offsetTop,
        behavior: 'smooth',
      });
    },
    captureElement: () => {
      const container = containerRef.current;
      if (container) {
        container.style.overflow = 'hidden';
        setTimeout(() => { container.style.overflow = 'auto'; }, 100);
      }
      return container;
    },
  }), [zoom]);

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

    for (const [key, cellData] of cells) {
      if (cellData.panel) continue;
      const [row, col] = key.split(',').map(Number);
      const baseWidth = cellData.shapeProps?.width ?? 1;
      const baseHeight = cellData.shapeProps?.height ?? 1;
      objects.push({
        key, row, col, cellData,
        widthCells: baseWidth,
        heightCells: baseHeight,
      });
    }

    for (const [key, cellData] of overlayCells) {
      const [row, col] = key.split(',').map(Number);
      const baseWidth = cellData.shapeProps?.width ?? 1;
      const baseHeight = cellData.shapeProps?.height ?? 1;
      objects.push({
        key: 'overlay-' + key,
        row, col, cellData,
        widthCells: baseWidth,
        heightCells: baseHeight,
      });
    }

    objects.sort((a, b) => (a.cellData.zOrder ?? 0) - (b.cellData.zOrder ?? 0));
    return objects;
  }, [cells, overlayCells]);

  const renderedObjects = useMemo(() => {
    return objectsToRender.map((obj) => (
      <GridSingleObject key={obj.key} obj={obj} />
    ));
  }, [objectsToRender]);

  const getPanelClasses = (panel: PanelInfo): string => {
    const base = 'absolute transition-all duration-300 ease-out';
    const invalid = panel.invalidReason ? 'opacity-50 grayscale' : '';
    const style = panel.panelStyle ?? PANEL_STYLE_DEFAULT;

    return `${base} ${style.borderClass} ${style.backgroundClass} ${invalid}`;
  };

  const renderedPanelBackgrounds = useMemo(() => {
    return panels.map((panel) => (
      <div
        key={panel.id}
        className={getPanelClasses(panel)}
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
    return panels.map((panel) => {
      const style = panel.panelStyle ?? PANEL_STYLE_DEFAULT;
      const textClass = panel.title ? style.titleTextClass : 'text-slate-400 dark:text-slate-500';
      return (
        <span
          key={panel.id}
          className={`absolute text-[10px] font-mono px-1 rounded ${style.titleBgClass} ${textClass}`}
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
      );
    });
  }, [panels]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-auto bg-gray-100 dark:bg-gray-900"
      onWheel={handleWheel}
    >
      <div
        ref={gridContentRef}
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
});
