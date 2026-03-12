import { useRef, useCallback, useMemo, memo, forwardRef, useImperativeHandle, useState, useEffect } from 'react';
import { useAnimationEnabled } from '../../animation/animationContext';
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
}: {
  obj: RenderableObject;
  mouseEnabled: boolean;
  onElementClick?: (elemId: number, position: [number, number]) => void;
}) {
  const { widthCells, heightCells } = obj;
  const [flashing, setFlashing] = useState(false);
  const animationsEnabled = useAnimationEnabled();
  // Start invisible so newly-appearing elements can fade in
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (!animationsEnabled) { setMounted(true); return; }
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []); // intentionally only on first mount

  if (widthCells <= 0 || heightCells <= 0) return null;

  const elemVisible = obj.cellData.elementInfo?.visible !== false;

  const { clickData } = obj.cellData;
  const isClickable = mouseEnabled && !!clickData && !!onElementClick;

  const handleClick = isClickable
    ? (e: React.MouseEvent<HTMLDivElement>) => {
        // Compute which cell within the element was clicked (zoom-independent via offsetX/Y)
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

  return (
    <div
      className={`absolute${animationsEnabled ? ' transition-all duration-300 ease-out' : ''}${isClickable ? ' cursor-pointer pointer-events-auto' : ''}`}
      style={{
        left: obj.col * CELL_SIZE,
        top: obj.row * CELL_SIZE,
        width: CELL_SIZE * widthCells,
        height: CELL_SIZE * heightCells,
        zIndex: 10,
        opacity: mounted && elemVisible ? 1 : 0,
        pointerEvents: elemVisible ? undefined : 'none',
      }}
      onClick={handleClick}
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
    </div>
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
        key: 'overlay-' + (cellData.objectId ?? posKey),
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
      <GridSingleObject key={obj.key} obj={obj} mouseEnabled={mouseEnabled} onElementClick={onElementClick} />
    ));
  }, [objectsToRender, mouseEnabled, onElementClick]);

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
      onMouseDown={() => { if (selectedTextBoxId) onSelectTextBox?.(null); }}
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
