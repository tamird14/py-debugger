import { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { Grid } from './components/Grid';
import { CodeEditor, SAMPLE_VISUAL_BUILDER } from './components/CodeEditor';
import { useGridState } from './hooks/useGridState';
import { useTheme } from './contexts/ThemeContext';
import { loadPyodide, isPyodideLoaded } from './services/pythonExecutor';
import { executeVisualBuilderCode } from './services/visualBuilderExecutor';
import { VISUAL_ELEM_SCHEMA } from './types/visualBuilder';

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

  const handleAnalyzeVisualBuilder = useCallback(async () => {
    if (!visualBuilderCode.trim()) return;

    setIsAnalyzingVisualBuilder(true);
    setVisualBuilderError(undefined);

    try {
      const result = await executeVisualBuilderCode(visualBuilderCode);

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

  const handleZoom = useCallback(
    (delta: number) => {
      setZoom(zoom + delta);
    },
    [zoom, setZoom]
  );

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
                  cells={cells}
                  overlayCells={overlayCells}
                  occupancyMap={occupancyMap}
                  panels={panels}
                  zoom={zoom}
                  onZoom={handleZoom}
                />

                {apiReferenceOpen && (
                  <div className="absolute top-0 right-0 h-full w-72 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-l border-gray-300 dark:border-gray-600 shadow-lg overflow-auto z-50">
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
