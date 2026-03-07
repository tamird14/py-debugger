import { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { CodeEditorArea } from './CodeEditorArea';
import { useTheme } from './contexts/ThemeContext';
import { loadPyodide, isPyodideLoaded } from './code-builder/services/pythonExecutor';
import { executeVisualBuilderCode } from './code-builder/services/visualBuilderExecutor';
import { ApiReferencePanel } from './ApiReferencePanel';
import { TimelineControls } from './timeline/TimelineControls';
import { GridArea, type GridAreaHandle } from './GridArea';
import { getStateAt, getMaxTime } from './timeline/timelineState';
import SAMPLE_VISUAL_BUILDER from './code-builder/sample.py?raw';

/* ---------- Shared Tailwind class groups ---------- */

const buttonBase =
  'px-3 py-1 rounded text-sm font-medium transition-colors';

const buttonNeutral =
  `${buttonBase} bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600`;


function App() {
  const { darkMode, toggleDarkMode } = useTheme();

  const gridAreaRef = useRef<GridAreaHandle>(null);

  // Visual builder state
  const [visualBuilderCode, setVisualBuilderCode] = useState(SAMPLE_VISUAL_BUILDER);
  const [isAnalyzingVisualBuilder, setIsAnalyzingVisualBuilder] = useState(false);
  const [visualBuilderError, setVisualBuilderError] = useState<string | undefined>();
  const [pyodideLoading, setPyodideLoading] = useState(false);
  const [pyodideReady, setPyodideReady] = useState(false);
  const [apiReferenceOpen, setApiReferenceOpen] = useState(false);

  // Timeline state
  const [currentStep, setCurrentStep] = useState(0);
  const [stepCount, setStepCount] = useState(0);

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

  const goToStep = useCallback((step: number) => {
    const clamped = Math.max(0, Math.min(getMaxTime(), step));
    const state = getStateAt(clamped);
    if (state) gridAreaRef.current?.loadVisualBuilderObjects(state);
    setCurrentStep(clamped);
  }, []);

  const handleAnalyzeVisualBuilder = useCallback(async (codeOverride?: string) => {
    const codeToAnalyze = typeof codeOverride === 'string' ? codeOverride : visualBuilderCode;
    if (!codeToAnalyze.trim()) return;

    setIsAnalyzingVisualBuilder(true);
    setVisualBuilderError(undefined);

    try {
      const result = await executeVisualBuilderCode(codeToAnalyze);

      if (result.success) {
        const total = getMaxTime() + 1;
        setStepCount(total);
        setCurrentStep(0);
        gridAreaRef.current?.loadVisualBuilderObjects(result.elements);
        setVisualBuilderError(undefined);
      } else {
        setVisualBuilderError(result.error);
      }
    } catch (err) {
      setVisualBuilderError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsAnalyzingVisualBuilder(false);
    }
  }, [visualBuilderCode]);

  const handleSave = useCallback(() => {
    const data = {
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

  const handleLoad = useCallback((data: { code?: string }) => {
    const { code } = data;
    if (!code) {
      setVisualBuilderError('Invalid file: missing code field');
      return;
    }
    setVisualBuilderCode(code);
    handleAnalyzeVisualBuilder(code);
  }, [handleAnalyzeVisualBuilder]);

  return (
    <div className="w-screen h-screen overflow-hidden flex flex-col bg-gray-100 dark:bg-gray-900 dark:text-gray-100">
      {/* Header */}
      <header className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center justify-between shadow-sm">
        {/* Header left */}
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

        {/* Header right */}
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

          {/* Timeline controls */}
          <TimelineControls
            currentStep={currentStep}
            stepCount={stepCount}
            onPrevStep={() => goToStep(currentStep - 1)}
            onNextStep={() => goToStep(currentStep + 1)}
            onGoToStep={goToStep}
          />

          {/* Dark mode toggle */}
          <button
            onClick={toggleDarkMode}
            className={buttonNeutral}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? 'Light' : 'Dark'}
          </button>

          <button
            type="button"
            onClick={() => setApiReferenceOpen((o) => !o)}
            className={`${buttonNeutral} min-w-[90px]`}
          >
            {apiReferenceOpen ? 'Hide' : 'Show'} API
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        <Group orientation="horizontal" className="h-full">
          {/* Left panel - Visual Builder */}
          <Panel defaultSize={50} minSize={20}>
            <div className="h-full border-r border-gray-300 dark:border-gray-600">
              <CodeEditorArea
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

          {/* Right panel - Grid Area */}
          <Panel defaultSize={50} minSize={20}>
            <div className="h-full relative">
              <GridArea ref={gridAreaRef} darkMode={darkMode} />

              {apiReferenceOpen && (
                <ApiReferencePanel
                  onClose={() => setApiReferenceOpen(false)}
                />
              )}
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