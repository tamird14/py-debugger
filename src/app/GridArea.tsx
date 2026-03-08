import { useState, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { toPng } from 'html-to-image';
import { Grid, type GridHandle } from '../visual-panel/components/Grid';
import { useGridState } from '../visual-panel/hooks/useGridState';
import type { VisualBuilderElementBase } from '../api/visualBuilder';
import { executeClickHandler } from '../code-builder/services/pythonExecutor';
import { getConstructor } from '../visual-panel/types/elementRegistry';

/* ---------- Shared Tailwind class groups ---------- */

const buttonBase =
  "px-3 py-1 rounded text-sm font-medium transition-colors";

const buttonNeutral =
  `${buttonBase} bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600`;

const buttonDisabled =
  `${buttonNeutral} disabled:opacity-50`;

const panelHeader =
  "flex-shrink-0 px-4 py-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between";

export interface GridAreaHandle {
  loadVisualBuilderObjects: (elements: VisualBuilderElementBase[]) => void;
}

interface GridAreaProps {
  darkMode: boolean;
  mouseEnabled: boolean;
}

export const GridArea = forwardRef<GridAreaHandle, GridAreaProps>(
  function GridArea({ darkMode, mouseEnabled }, ref) {
    const {
      cells,
      overlayCells,
      zoom,
      zoomIn,
      zoomOut,
      setZoom,
      panels,
      loadVisualBuilderObjects,
      occupancyMap,
    } = useGridState();

    const gridRef = useRef<GridHandle>(null);
    const [isCapturing, setIsCapturing] = useState(false);

    useImperativeHandle(ref, () => ({ loadVisualBuilderObjects }), [loadVisualBuilderObjects]);

    const handleZoom = useCallback(
      (delta: number) => {
        setZoom(zoom + delta);
      },
      [zoom, setZoom]
    );

    const handleAlignGrid = useCallback(() => {
      gridRef.current?.alignGrid();
    }, []);

    const handleElementClick = useCallback(async (elemId: number, position: [number, number]) => {
      const rawElements = await executeClickHandler(elemId, position[0], position[1]);
      if (!rawElements) return;
      const hydrated = rawElements.map((el) => {
        const ctor = getConstructor(el.type);
        return ctor ? new ctor(el) : el;
      });
      loadVisualBuilderObjects(hydrated);
    }, [loadVisualBuilderObjects]);

    const handleScreenshot = useCallback(async () => {
      const element = gridRef.current?.captureElement();
      if (!element || isCapturing) return;

      setIsCapturing(true);
      try {
        const viewportWidth = element.clientWidth;
        const viewportHeight = element.clientHeight;
        const scrollLeft = element.scrollLeft;
        const scrollTop = element.scrollTop;

        const fullDataUrl = await toPng(element, {
          pixelRatio: 1,
          backgroundColor: darkMode ? '#111827' : '#f3f4f6',
          skipFonts: true,
          cacheBust: false,
        });

        const img = new Image();
        img.src = fullDataUrl;
        await new Promise((resolve) => { img.onload = resolve; });

        const canvas = document.createElement('canvas');
        canvas.width = viewportWidth;
        canvas.height = viewportHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get canvas context');

        ctx.drawImage(
          img,
          scrollLeft, scrollTop, viewportWidth, viewportHeight,
          0, 0, viewportWidth, viewportHeight
        );

        const croppedDataUrl = canvas.toDataURL('image/png');

        const link = document.createElement('a');
        link.href = croppedDataUrl;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        link.download = `visual-panel-${timestamp}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err) {
        console.error('Screenshot failed:', err);
      } finally {
        setIsCapturing(false);
      }
    }, [darkMode, isCapturing]);

    return (
      <div className="h-full flex flex-col">
        <div className={panelHeader}>
          {/* Visual controls */}
          <div className="flex items-center gap-2">
            <button onClick={zoomOut} className={buttonNeutral}>
              -
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-300 min-w-[60px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button onClick={zoomIn} className={buttonNeutral}>
              +
            </button>
            <button
              onClick={handleAlignGrid}
              className={buttonNeutral}
              title="Align grid to viewport"
            >
              ⊞
            </button>
            <button
              onClick={handleScreenshot}
              disabled={isCapturing}
              className={buttonDisabled}
              title="Download screenshot"
            >
              {isCapturing ? '⏳' : '📷'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <Grid
            ref={gridRef}
            cells={cells}
            overlayCells={overlayCells}
            occupancyMap={occupancyMap}
            panels={panels}
            zoom={zoom}
            onZoom={handleZoom}
            darkMode={darkMode}
            mouseEnabled={mouseEnabled}
            onElementClick={handleElementClick}
          />
        </div>
      </div>
    );
  }
);
