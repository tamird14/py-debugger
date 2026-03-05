import { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { toPng } from 'html-to-image';
import { Grid, type GridHandle } from './visual-panel/components/Grid';
import { CodeEditor, SAMPLE_VISUAL_BUILDER } from './code-builder/CodeEditor';
import { useGridState } from './visual-panel/hooks/useGridState';
import { useTheme } from './contexts/ThemeContext';
import { loadPyodide, isPyodideLoaded } from './code-builder/services/pythonExecutor';
import { executeVisualBuilderCode } from './code-builder/services/visualBuilderExecutor';
import { VISUAL_ELEM_SCHEMA } from './api/visualBuilder';

function App() {
  const { darkMode, toggleDarkMode } = useTheme();

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

  // Visual builder state
  const [visualBuilderCode, setVisualBuilderCode] = useState(SAMPLE_VISUAL_BUILDER);
  const [isAnalyzingVisualBuilder, setIsAnalyzingVisualBuilder] = useState(false);
  const [visualBuilderError, setVisualBuilderError] = useState<string | undefined>();
  const [pyodideLoading, setPyodideLoading] = useState(false);
  const [pyodideReady, setPyodideReady] = useState(false);
  const [apiReferenceOpen, setApiReferenceOpen] = useState(false);
  const [apiPanelWidth, setApiPanelWidth] = useState(288);
  const isResizingRef = useRef(false);
  const apiPanelContainerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<GridHandle>(null);

  // Preload Pyodide on mount
  useEffect(() => {
    if (!isPyodideLoaded()) {
      setPyodideLoading(true);
      loadPyodide()
        .then(() => {
          setPyodideReady(true);
          setPyodideLoading(false);
        })
        .catch((err) => {
          console.error('Failed to load Pyodide:', err);
          setPyodideLoading(false);
        });
    } else {
      setPyodideReady(true);
    }
  }, []);

  const handleAnalyzeVisualBuilder = useCallback(async (codeOverride?: string) => {
    const codeToAnalyze = typeof codeOverride === 'string' ? codeOverride : visualBuilderCode;
    if (!codeToAnalyze.trim()) return;

    setIsAnalyzingVisualBuilder(true);
    setVisualBuilderError(undefined);

    try {
      const result = await executeVisualBuilderCode(codeToAnalyze);

      if (result.success) {
        loadVisualBuilderObjects(result.elements);
        setVisualBuilderError(undefined);
      } else {
        setVisualBuilderError(result.error);
      }
    } catch (err) {
      setVisualBuilderError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsAnalyzingVisualBuilder(false);
    }
  }, [visualBuilderCode, loadVisualBuilderObjects]);

  const handleSave = useCallback(() => {
    const data = {
      mode: 'simple',
      code: visualBuilderCode,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'visual-builder.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [visualBuilderCode]);

  const handleLoad = useCallback((data: { mode?: string; code?: string }) => {
    if (!data.mode || !data.code) {
      setVisualBuilderError('Invalid file: missing mode or code field');
      return;
    }
    setVisualBuilderCode(data.code);
    handleAnalyzeVisualBuilder(data.code);
  }, [handleAnalyzeVisualBuilder]);

  const handleZoom = useCallback(
    (delta: number) => {
      setZoom(zoom + delta);
    },
    [zoom, setZoom]
  );

  const handleApiPanelResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    const startX = e.clientX;
    const startWidth = apiPanelWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.max(200, Math.min(600, startWidth + delta));
      setApiPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [apiPanelWidth]);

  const handleAlignGrid = useCallback(() => {
    gridRef.current?.alignGrid();
  }, []);

  const [isCapturing, setIsCapturing] = useState(false);

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
    <div className="w-screen h-screen overflow-hidden flex flex-col bg-gray-100 dark:bg-gray-900 dark:text-gray-100">
      {/* Header */}
      <header className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-indigo-600 dark:text-indigo-400">Visual Panel</h1>
          <span className="text-sm text-gray-400 dark:text-gray-500">Builder + API</span>
          <Link
            to="/plan"
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            About
          </Link>
        </div>

        <div className="flex items-center gap-4">
          {/* Pyodide status */}
          {pyodideLoading && (
            <span className="text-xs text-amber-600 flex items-center gap-1">
              <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
              Loading Python...
            </span>
          )}
          {pyodideReady && !pyodideLoading && (
            <span className="text-xs text-emerald-600 flex items-center gap-1">
              <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
              Python Ready
            </span>
          )}

          {/* Zoom controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={zoomOut}
              className="px-3 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-sm font-medium transition-colors"
            >
              -
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-300 min-w-[60px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={zoomIn}
              className="px-3 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-sm font-medium transition-colors"
            >
              +
            </button>
            <button
              onClick={handleAlignGrid}
              className="px-3 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-sm font-medium transition-colors"
              title="Align grid to viewport"
            >
              ⊞
            </button>
            <button
              onClick={handleScreenshot}
              disabled={isCapturing}
              className="px-3 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-sm font-medium transition-colors disabled:opacity-50"
              title="Download screenshot"
            >
              {isCapturing ? '⏳' : '📷'}
            </button>
          </div>

          {/* Dark mode toggle */}
          <button
            onClick={toggleDarkMode}
            className="px-3 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-sm font-medium transition-colors"
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>

      {/* Main content - resizable panel layout */}
      <main className="flex-1 overflow-hidden">
        <Group orientation="horizontal" className="h-full">
          {/* Left panel - Visual Builder */}
          <Panel defaultSize={50} minSize={20}>
            <div className="h-full border-r border-gray-300 dark:border-gray-600">
              <CodeEditor
                code={visualBuilderCode}
                onChange={setVisualBuilderCode}
                onAnalyze={handleAnalyzeVisualBuilder}
                onSave={handleSave}
                onLoad={handleLoad}
                isAnalyzing={isAnalyzingVisualBuilder}
                error={visualBuilderError}
              />
            </div>
          </Panel>

          <Separator className="w-1 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 cursor-col-resize" />

          {/* Right panel - Visual Grid */}
          <Panel defaultSize={50} minSize={20}>
            <div className="h-full flex flex-col">
              <div className="flex-shrink-0 px-4 py-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Visual Panel</span>
                <button
                  type="button"
                  onClick={() => setApiReferenceOpen((o) => !o)}
                  className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  {apiReferenceOpen ? 'Hide' : 'Show'} API
                </button>
              </div>
              <div className="flex-1 overflow-hidden relative">
                <Grid
                  ref={gridRef}
                  cells={cells}
                  overlayCells={overlayCells}
                  occupancyMap={occupancyMap}
                  panels={panels}
                  zoom={zoom}
                  onZoom={handleZoom}
                  darkMode={darkMode}
                />

                {apiReferenceOpen && (
                  <div
                    ref={apiPanelContainerRef}
                    className="absolute top-0 right-0 h-full bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-l border-gray-300 dark:border-gray-600 shadow-lg overflow-auto z-50 flex"
                    style={{ width: apiPanelWidth }}
                  >
                    <div
                      className="w-1 h-full cursor-ew-resize bg-transparent hover:bg-indigo-400 dark:hover:bg-indigo-500 transition-colors flex-shrink-0"
                      onMouseDown={handleApiPanelResizeStart}
                    />
                    <div className="flex-1 overflow-auto">
                      <div className="px-3 py-2 border-b border-gray-300 dark:border-gray-600 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800">
                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">API Reference</span>
                        <button
                          type="button"
                          onClick={() => setApiReferenceOpen(false)}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm"
                        >
                          &times;
                        </button>
                      </div>
                      <div className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 space-y-3">
                        {VISUAL_ELEM_SCHEMA.map((cls) => (
                          <div key={cls.className} className="border-b border-gray-300 dark:border-gray-600 pb-2 last:border-0">
                            <div className="font-mono font-medium text-gray-900 dark:text-gray-200">
                              {cls.className}({cls.constructorParams})
                            </div>
                            <div className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">{cls.docstring}</div>
                            <div className="mt-1.5 space-y-0.5">
                              {cls.properties.map((p) => (
                                <div key={p.name} className="font-mono text-xs">
                                  <span className="text-amber-600 dark:text-amber-300">{p.name}</span>
                                  <span className="text-gray-400 dark:text-gray-500">: {p.type}</span>
                                  <div className="text-gray-500 dark:text-gray-400 pl-2">{p.description}</div>
                                </div>
                              ))}
                              {cls.methods?.map((m) => (
                                <div key={m.name} className="font-mono text-xs mt-0.5">
                                  <span className="text-cyan-600 dark:text-cyan-300">{m.name}</span>
                                  <span className="text-gray-400 dark:text-gray-500"> {m.signature}</span>
                                  <div className="text-gray-500 dark:text-gray-400 pl-2">{m.docstring}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Panel>
        </Group>
      </main>

      {/* Footer */}
      <footer className="flex-shrink-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
        <span className="mr-4">1. Write Visual Builder Python code</span>
        <span className="mr-4">2. Click "Analyze" to render elements</span>
        <span>3. Click "Show API" on the visual panel to see object docs</span>
      </footer>
    </div>
  );
}

export default App;
