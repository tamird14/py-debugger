import { useRef, useCallback, useMemo, memo, forwardRef, useImperativeHandle, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAnimationEnabled, useAnimationDuration } from '../../animation/animationContext';
import { GridCell } from './GridCell';
import type { RenderableObjectData, PanelStyle } from '../types/grid';
import { PANEL_STYLE_DEFAULT } from '../types/grid';
import type { TextBox } from '../../text-boxes/types';
import { TextBoxesLayer } from '../../text-boxes/TextBoxesLayer';

// ── Constants ──────────────────────────────────────────────────────────────

export const CELL_SIZE = 40;
const GRID_COLS = 50;
const GRID_ROWS = 50;

// ── Types ──────────────────────────────────────────────────────────────────

interface GridProps {
  cells: Map<string, RenderableObjectData>;
  overlayCells?: Map<string, RenderableObjectData>;
  occupancyMap?: Map<string, unknown>; // kept for API compat
  panels: Array<PanelInfo>;
  zoom: number;
  onZoom: (delta: number) => void;
  darkMode?: boolean;
  mouseEnabled?: boolean;
  onElementClick?: (elemId: number, position: [number, number]) => void;
  onElementDrag?: (elemId: number, position: [number, number], dragType: 'start' | 'mid' | 'end') => Promise<void> | void;
  // Text box props
  textBoxes?: TextBox[];
  selectedTextBoxId?: string | null;
  addingTextBox?: boolean;
  onSelectTextBox?: (id: string | null) => void;
  onTextBoxAdded?: (box: TextBox) => void;
  onTextBoxChange?: (box: TextBox) => void;
  onTextBoxDelete?: (id: string) => void;
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
  showBorder?: boolean;
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
  mouseEnabled,
  onElementClick,
  onElementDragStart,
}: {
  obj: RenderableObject;
  mouseEnabled: boolean;
  onElementClick?: (elemId: number, position: [number, number]) => void;
  onElementDragStart?: (elemId: number, position: [number, number]) => void; // internal: Grid handles drag type
}) {
  const { widthCells, heightCells } = obj;
  const [flashing, setFlashing] = useState(false);
  const globalAnimationsEnabled = useAnimationEnabled();
  const animationDuration = useAnimationDuration();
  // Per-element animate flag: false overrides the global toggle to force jump mode.
  const animationsEnabled = globalAnimationsEnabled && obj.cellData.animate !== false;

  if (widthCells <= 0 || heightCells <= 0) return null;

  const elemVisible = obj.cellData.elementInfo?.visible !== false;

  const { clickData, dragData } = obj.cellData;
  const isClickable = mouseEnabled && !!clickData && !!onElementClick;
  const isDraggable = mouseEnabled && !!dragData && !!onElementDragStart;

  const handleClick = isClickable
    ? (e: React.MouseEvent<HTMLDivElement>) => {
        const colOffset = Math.floor(e.nativeEvent.offsetX / CELL_SIZE);
        const rowOffset = Math.floor(e.nativeEvent.offsetY / CELL_SIZE);
        const pos: [number, number] = [
          clickData!.position[0] + rowOffset,
          clickData!.position[1] + colOffset,
        ];
        onElementClick!(clickData!.elemId, pos);
        setFlashing(true);
        setTimeout(() => setFlashing(false), 300);
      }
    : undefined;

  const handleMouseDown = isDraggable
    ? (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        const colOffset = Math.floor(e.nativeEvent.offsetX / CELL_SIZE);
        const rowOffset = Math.floor(e.nativeEvent.offsetY / CELL_SIZE);
        const pos: [number, number] = [
          dragData!.position[0] + rowOffset,
          dragData!.position[1] + colOffset,
        ];
        onElementDragStart!(dragData!.elemId, pos);
      }
    : undefined;

  const cursorClass = isDraggable ? ' cursor-grab pointer-events-auto' : isClickable ? ' cursor-pointer pointer-events-auto' : '';
  const transition = animationsEnabled
    ? { duration: animationDuration / 1000, ease: 'easeOut' as const }
    : { duration: 0 };

  return (
    <motion.div
      className={`absolute${cursorClass}`}
      initial={{ opacity: 0 }}
      animate={{
        left: obj.col * CELL_SIZE,
        top: obj.row * CELL_SIZE,
        width: CELL_SIZE * widthCells,
        height: CELL_SIZE * heightCells,
        opacity: elemVisible ? 1 : 0,
      }}
      transition={transition}
      style={{ zIndex: 10, pointerEvents: elemVisible ? undefined : 'none' }}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
    >
      <GridCell
        row={obj.row}
        col={obj.col}
        cellData={obj.cellData}
        size={CELL_SIZE}
        width={CELL_SIZE * widthCells}
        height={CELL_SIZE * heightCells}
      />
      {flashing && (
        <div className="absolute inset-0 bg-white/60 rounded pointer-events-none" />
      )}
    </motion.div>
  );
});

// ── Main Grid component ────────────────────────────────────────────────────

export const Grid = forwardRef<GridHandle, GridProps>(function Grid({
  cells,
  overlayCells = new Map(),
  occupancyMap: _occupancyMap = new Map(),
  panels,
  zoom,
  onZoom,
  darkMode = false,
  mouseEnabled = false,
  onElementClick,
  onElementDrag,
  textBoxes = [],
  selectedTextBoxId = null,
  addingTextBox = false,
  onSelectTextBox,
  onTextBoxAdded,
  onTextBoxChange,
  onTextBoxDelete,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridContentRef = useRef<HTMLDivElement>(null);
  const animationDuration = useAnimationDuration();

  // ── Drag state ──────────────────────────────────────────────────────────
  const dragStateRef = useRef<{ elemId: number; lastRow: number; lastCol: number } | null>(null);
  const dragCallInFlightRef = useRef(false);

  // Stable ref to avoid stale closures in window-level event listeners
  const onElementDragRef = useRef(onElementDrag);
  useEffect(() => {
    onElementDragRef.current = onElementDrag;
  });

  // Window-level mouseup so drag end fires even if mouse leaves the grid
  useEffect(() => {
    const handleMouseUp = () => {
      if (!dragStateRef.current) return;
      const { elemId, lastRow, lastCol } = dragStateRef.current;
      dragStateRef.current = null;
      dragCallInFlightRef.current = false;
      onElementDragRef.current?.(elemId, [lastRow, lastCol], 'end');
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const getCellFromMouseEvent = useCallback((e: React.MouseEvent): [number, number] => {
    const container = containerRef.current;
    if (!container) return [0, 0];
    const rect = container.getBoundingClientRect();
    const x = (e.clientX - rect.left + container.scrollLeft) / zoom / CELL_SIZE;
    const y = (e.clientY - rect.top + container.scrollTop) / zoom / CELL_SIZE;
    return [Math.max(0, Math.floor(y)), Math.max(0, Math.floor(x))];
  }, [zoom]);

  const handleDragStart = useCallback((elemId: number, position: [number, number]) => {
    dragStateRef.current = { elemId, lastRow: position[0], lastCol: position[1] };
    Promise.resolve(onElementDragRef.current?.(elemId, position, 'start'))
      .finally(() => { dragCallInFlightRef.current = false; });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragStateRef.current || dragCallInFlightRef.current) return;
    const [row, col] = getCellFromMouseEvent(e);
    const { elemId, lastRow, lastCol } = dragStateRef.current;
    if (row === lastRow && col === lastCol) return;
    dragStateRef.current.lastRow = row;
    dragStateRef.current.lastCol = col;
    dragCallInFlightRef.current = true;
    // Wrap in Promise.resolve so the in-flight flag clears whether the handler
    // returns a Promise (async) or void (sync / not defined).
    Promise.resolve(onElementDragRef.current?.(elemId, [row, col], 'mid'))
      .finally(() => { dragCallInFlightRef.current = false; });
  }, [getCellFromMouseEvent]);

  // ── Grid setup ──────────────────────────────────────────────────────────

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
    captureElement: () => containerRef.current,
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

  const gridLineColor = darkMode ? '#4b5563' : '#d1d5db';
  const gridBgColor = darkMode ? '#1f2937' : '#ffffff';

  const objectsToRender = useMemo((): RenderableObject[] => {
    const objects: RenderableObject[] = [];

    for (const [posKey, cellData] of cells) {
      if (cellData.panel) continue;
      const [row, col] = posKey.split(',').map(Number);
      const baseWidth = cellData.shapeProps?.width ?? 1;
      const baseHeight = cellData.shapeProps?.height ?? 1;
      objects.push({
        key: cellData.objectId ?? posKey,
        row, col, cellData,
        widthCells: baseWidth,
        heightCells: baseHeight,
      });
    }

    for (const [posKey, cellData] of overlayCells) {
      const [row, col] = posKey.split(',').map(Number);
      const baseWidth = cellData.shapeProps?.width ?? 1;
      const baseHeight = cellData.shapeProps?.height ?? 1;
      objects.push({
        key: cellData.objectId ?? ('overlay-' + posKey),
        row, col, cellData,
        widthCells: baseWidth,
        heightCells: baseHeight,
      });
    }

    objects.sort((a, b) =>
      (b.cellData.userZ ?? 0) - (a.cellData.userZ ?? 0) ||
      (a.cellData.zOrder ?? 0) - (b.cellData.zOrder ?? 0)
    );
    return objects;
  }, [cells, overlayCells]);

  const renderedObjects = useMemo(() => {
    return objectsToRender.map((obj) => (
      <GridSingleObject
        key={obj.key}
        obj={obj}
        mouseEnabled={mouseEnabled}
        onElementClick={onElementClick}
        onElementDragStart={handleDragStart}
      />
    ));
  }, [objectsToRender, mouseEnabled, onElementClick, handleDragStart]);

  const getPanelClasses = (panel: PanelInfo): string => {
    const base = 'absolute transition-all ease-out';
    const invalid = panel.invalidReason ? 'opacity-50 grayscale' : '';
    const style = panel.panelStyle ?? PANEL_STYLE_DEFAULT;

    return `${base} ${style.borderClass} ${style.backgroundClass} ${invalid}`;
  };

  const renderedPanelBackgrounds = useMemo(() => {
    return panels.filter((p) => p.showBorder !== false).map((panel) => (
      <div
        key={panel.id}
        className={getPanelClasses(panel)}
        style={{
          left: panel.col * CELL_SIZE,
          top: panel.row * CELL_SIZE,
          width: panel.width * CELL_SIZE,
          height: panel.height * CELL_SIZE,
          zIndex: 5,
          transitionDuration: `${animationDuration}ms`,
        }}
      />
    ));
  }, [panels]);

  const renderedPanelHandles = useMemo(() => {
    return panels.filter((p) => p.showBorder !== false).map((panel) => {
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
      onMouseDown={() => { if (selectedTextBoxId) onSelectTextBox?.(null); }}
      onMouseMove={handleMouseMove}
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
          style={{
            width: CELL_SIZE * GRID_COLS,
            height: CELL_SIZE * GRID_ROWS,
            backgroundColor: gridBgColor,
            backgroundImage: `linear-gradient(to right, ${gridLineColor} 1px, transparent 1px), linear-gradient(to bottom, ${gridLineColor} 1px, transparent 1px)`,
            backgroundSize: `${CELL_SIZE}px ${CELL_SIZE}px`,
          }}
        />

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

        {/* Text boxes layer */}
        <div
          className="absolute inset-0"
          style={{ pointerEvents: addingTextBox ? 'auto' : 'none' }}
        >
          <div className="relative w-full h-full">
            <TextBoxesLayer
              textBoxes={textBoxes}
              selectedId={selectedTextBoxId}
              zoom={zoom}
              addingTextBox={addingTextBox}
              onSelectTextBox={onSelectTextBox ?? (() => {})}
              onTextBoxAdded={onTextBoxAdded ?? (() => {})}
              onTextBoxChange={onTextBoxChange ?? (() => {})}
              onTextBoxDelete={onTextBoxDelete ?? (() => {})}
            />
          </div>
        </div>
      </div>
    </div>
  );
});
