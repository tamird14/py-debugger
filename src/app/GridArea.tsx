import { useState, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { toPng } from 'html-to-image';
import { Grid, type GridHandle } from '../visual-panel/components/Grid';
import { useGridState } from '../visual-panel/hooks/useGridState';
import type { VisualBuilderElementBase } from '../api/visualBuilder';
import { executeEventHandler, type ClickHandlerResult, type DragType } from '../python-engine/code-builder/services/pythonExecutor';
import { executeCombinedClickHandler, executeCombinedInputChanged, type CombinedClickResult } from '../components/combined-editor/combinedExecutor';
import { hydrateElement } from '../visual-panel/types/elementRegistry';
import type { TextBox } from '../text-boxes/types';
import type { VizRange } from '../components/combined-editor/vizBlockParser';

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
  textBoxes: TextBox[];
  onTextBoxesChange: (boxes: TextBox[]) => void;
  /** Combined-editor: viz block ranges for the current code, used for auto-tracing clicks. */
  combinedVizRanges?: VizRange[];
  /** Combined-editor: called when a click produces a traced mini-timeline. */
  onCombinedTrace?: (result: CombinedClickResult) => void;
}

export const GridArea = forwardRef<GridAreaHandle, GridAreaProps>(
  function GridArea({ darkMode, mouseEnabled, textBoxes, onTextBoxesChange, combinedVizRanges, onCombinedTrace }, ref) {
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
    const [addingTextBox, setAddingTextBox] = useState(false);
    const [selectedTextBoxId, setSelectedTextBoxId] = useState<string | null>(null);

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

    const handleElementClick = useCallback(async (elemId: number, x: number, y: number) => {
      if (combinedVizRanges) {
        const result = await executeCombinedClickHandler(elemId, y, x, combinedVizRanges);
        if (!result) return;
        if (result.interactiveTimeline.length > 0) {
          onCombinedTrace?.(result);
        } else {
          loadVisualBuilderObjects(result.finalSnapshot.map((el) => hydrateElement(el)));
        }
        return;
      }
    }, [combinedVizRanges, loadVisualBuilderObjects, onCombinedTrace]);

    const handleElementInput = useCallback(async (elemId: number, text: string) => {
      if (!combinedVizRanges) return;
      const result = await executeCombinedInputChanged(elemId, text, combinedVizRanges);
      if (!result) return;
      if (result.interactiveTimeline.length > 0) {
        onCombinedTrace?.(result);
      } else {
        loadVisualBuilderObjects(result.finalSnapshot.map((el) => hydrateElement(el)));
      }
    }, [combinedVizRanges, loadVisualBuilderObjects, onCombinedTrace]);

    const applyEventResult = useCallback((result: ClickHandlerResult) => {
      if (!result || result.error) {
        return;
      }
      const hydrated = result.snapshot.map((el) => hydrateElement(el));
      loadVisualBuilderObjects(hydrated);
    }, [loadVisualBuilderObjects]);

    const handleElementDrag = useCallback(async (elemId: number, x: number, y: number, dragType: DragType) => {
      applyEventResult(await executeEventHandler('on_drag', elemId, y, x, dragType));
    }, [applyEventResult]);

    const handleTextBoxAdded = useCallback((box: TextBox) => {
      onTextBoxesChange([...textBoxes, box]);
      setSelectedTextBoxId(box.id);
      setAddingTextBox(false);
    }, [textBoxes, onTextBoxesChange]);

    const handleTextBoxChange = useCallback((updated: TextBox) => {
      onTextBoxesChange(textBoxes.map((b) => (b.id === updated.id ? updated : b)));
    }, [textBoxes, onTextBoxesChange]);

    const handleTextBoxDelete = useCallback((id: string) => {
      onTextBoxesChange(textBoxes.filter((b) => b.id !== id));
      setSelectedTextBoxId(null);
    }, [textBoxes, onTextBoxesChange]);

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
            <button
              onClick={() => setAddingTextBox((v) => !v)}
              className={`${buttonNeutral}${addingTextBox ? ' ring-2 ring-inset ring-indigo-500' : ''}`}
              title="Add text annotation (click-drag on grid)"
            >
              T+
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
            onElementDrag={handleElementDrag}
            onElementInput={handleElementInput}
            textBoxes={textBoxes}
            selectedTextBoxId={selectedTextBoxId}
            addingTextBox={addingTextBox}
            onSelectTextBox={setSelectedTextBoxId}
            onTextBoxAdded={handleTextBoxAdded}
            onTextBoxChange={handleTextBoxChange}
            onTextBoxDelete={handleTextBoxDelete}
          />
        </div>
      </div>
    );
  }
);
