import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { CodeEditorArea } from './CodeEditorArea';
import { useTheme } from '../contexts/ThemeContext';
import { loadPyodide, isPyodideLoaded, executePythonCode, executeDebugCall } from '../code-builder/services/pythonExecutor';
import { ApiReferencePanel } from '../api/ApiReferencePanel';
import { TimelineControls } from '../timeline/TimelineControls';
import { GridArea, type GridAreaHandle } from './GridArea';
import { getStateAt, getMaxTime, getTimeline } from '../timeline/timelineState';
import { getCodeStepAt } from '../debugger-panel/codeTimelineState';
import SAMPLE_VISUAL_BUILDER from '../code-builder/sample.py?raw';
import SAMPLE_DEBUGGER from '../debugger-panel/debuggerSample.py?raw';

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
  const [debuggerCode, setDebuggerCode] = useState(SAMPLE_DEBUGGER);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | undefined>();
  const [analyzeStatus, setAnalyzeStatus] = useState<'idle' | 'success' | 'error' | 'dirty'>('idle');
  const everAnalyzedRef = useRef(false);
  const [pyodideLoading, setPyodideLoading] = useState(false);
  const [pyodideReady, setPyodideReady] = useState(false);
  const [apiReferenceOpen, setApiReferenceOpen] = useState(false);

  type AppMode = 'idle' | 'trace' | 'interactive' | 'debug_in_event';
  const [appMode, setAppMode] = useState<AppMode>('idle');
  const mouseEnabled = appMode === 'interactive';

  // Timeline state
  const [currentStep, setCurrentStep] = useState(0);
  const [stepCount, setStepCount] = useState(0);
  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set());

  // Mark dirty whenever code changes after a completed analysis
  useEffect(() => {
    if (everAnalyzedRef.current) setAnalyzeStatus('dirty');
  }, [visualBuilderCode, debuggerCode]);

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

  const currentVariables = useMemo(
    () => getCodeStepAt(currentStep)?.variables ?? {},
    // stepCount changes when a new trace is loaded, forcing a re-compute
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentStep, stepCount],
  );

  const highlightedLines = useMemo(() => {
    const scope = getCodeStepAt(currentStep)?.scope ?? [];
    const next = scope.length > 0 ? scope[scope.length - 1][1] : null;
    const prevScope = currentStep > 0 ? getCodeStepAt(currentStep - 1)?.scope ?? [] : [];
    const prev = prevScope.length > 0 ? prevScope[prevScope.length - 1][1] : null;
    return { prev, next };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, stepCount]);

  const getStepLine = (step: number) => {
    const scope = getCodeStepAt(step)?.scope ?? [];
    return scope.length > 0 ? scope[scope.length - 1][1] : null;
  };

  const goToNextBreakpoint = useCallback(() => {
    const max = getMaxTime();
    for (let t = currentStep + 1; t <= max; t++) {
      const line = getStepLine(t);
      if (line != null && breakpoints.has(line)) { goToStep(t); return; }
    }
  }, [currentStep, breakpoints, goToStep]);

  const goToPrevBreakpoint = useCallback(() => {
    for (let t = currentStep - 1; t >= 0; t--) {
      const line = getStepLine(t);
      if (line != null && breakpoints.has(line)) { goToStep(t); return; }
    }
  }, [currentStep, breakpoints, goToStep]);

  const hasNextBreakpoint = useMemo(() => {
    const max = getMaxTime();
    for (let t = currentStep + 1; t <= max; t++) {
      const line = getStepLine(t);
      if (line != null && breakpoints.has(line)) return true;
    }
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, stepCount, breakpoints]);

  const hasPrevBreakpoint = useMemo(() => {
    for (let t = currentStep - 1; t >= 0; t--) {
      const line = getStepLine(t);
      if (line != null && breakpoints.has(line)) return true;
    }
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, stepCount, breakpoints]);

  const handleEdit = useCallback(() => {
    setAnalyzeStatus('dirty');
    setAppMode('idle');
  }, []);

  const handleAnalyze = useCallback(async () => {
    setIsAnalyzing(true);
    setAnalyzeError(undefined);

    try {
      const result = await executePythonCode(visualBuilderCode, debuggerCode);

      if (result.success) {
        setStepCount(getMaxTime() + 1);
        setCurrentStep(0);
        gridAreaRef.current?.loadVisualBuilderObjects(getTimeline()[0]);
        setAnalyzeStatus('success');
        setAppMode('trace');
      } else {
        setAnalyzeError(result.error);
        setAnalyzeStatus('error');
      }
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Unknown error');
      setAnalyzeStatus('error');
    } finally {
      everAnalyzedRef.current = true;
      setIsAnalyzing(false);
    }
  }, [visualBuilderCode, debuggerCode]);

  const handleSave = useCallback(() => {
    const data = {
      code: visualBuilderCode,
      debuggerCode,
      currentTime: currentStep,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'visual-debugger.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [visualBuilderCode, debuggerCode, currentStep]);

  const handleLoad = useCallback((data: { code?: string; debuggerCode?: string; currentTime?: number }) => {
    const { code, debuggerCode: savedDebugger, currentTime = 0 } = data;
    if (!code) {
      setAnalyzeError('Invalid file: missing code field');
      return;
    }
    setVisualBuilderCode(code);
    if (savedDebugger) setDebuggerCode(savedDebugger);
    // Jump to saved time after re-analyze happens externally
    void currentTime;
  }, []);

  const handleEnterInteractive = useCallback(() => {
    goToStep(getMaxTime());
    setAppMode('interactive');
  }, [goToStep]);

  const handleDebugCall = useCallback(async (expression: string) => {
    setAppMode('debug_in_event');
    const result = await executeDebugCall(expression);
    if (result?.error) {
      setAnalyzeError(result.error);
      setAnalyzeStatus('error');
      setAppMode('interactive');
      return;
    }
    if (result && result.codeTimeline.length > 0) {
      setStepCount(result.codeTimeline.length);
      setCurrentStep(0);
      const state = getStateAt(0);
      if (state) gridAreaRef.current?.loadVisualBuilderObjects(state);
    } else {
      setAppMode('interactive');
    }
  }, []);

  const handleBackToInteractive = useCallback(() => {
    goToStep(getMaxTime());
    setAppMode('interactive');
  }, [goToStep]);

  return (
    <div className="w-screen h-screen overflow-hidden flex flex-col bg-gray-100 dark:bg-gray-900 dark:text-gray-100">
      {/* Header */}
      <header className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center justify-between shadow-sm">
        {/* Header left */}
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-indigo-600 dark:text-indigo-400">Visual Debugger</h1>
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

          {/* Timeline controls — hidden in interactive mode */}
          {appMode !== 'interactive' && (
            <TimelineControls
              currentStep={currentStep}
              stepCount={stepCount}
              onPrevStep={() => goToStep(currentStep - 1)}
              onNextStep={() => goToStep(currentStep + 1)}
              onGoToStep={goToStep}
              onPrevBreakpoint={goToPrevBreakpoint}
              onNextBreakpoint={goToNextBreakpoint}
              hasPrevBreakpoint={hasPrevBreakpoint}
              hasNextBreakpoint={hasNextBreakpoint}
            />
          )}

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
          {/* Left panel - Code Editor */}
          <Panel defaultSize={50} minSize={20}>
            <div className="h-full border-r border-gray-300 dark:border-gray-600">
              <CodeEditorArea
                code={visualBuilderCode}
                onChange={setVisualBuilderCode}
                debuggerCode={debuggerCode}
                onDebuggerCodeChange={setDebuggerCode}
                onAnalyze={handleAnalyze}
                onEdit={handleEdit}
                onSave={handleSave}
                onLoad={handleLoad}
                isAnalyzing={isAnalyzing}
                analyzeStatus={analyzeStatus}
                error={analyzeError}
                currentVariables={currentVariables}
                highlightedLines={highlightedLines}
                breakpoints={breakpoints}
                onBreakpointsChange={setBreakpoints}
                appMode={appMode}
                readOnly={analyzeStatus === 'success' || appMode !== 'idle'}
                onEnterInteractive={handleEnterInteractive}
                onBackToInteractive={handleBackToInteractive}
              />
            </div>
          </Panel>

          <Separator className="w-1 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 cursor-col-resize" />

          {/* Right panel - Grid Area */}
          <Panel defaultSize={50} minSize={20}>
            <div className="h-full relative">
              <GridArea ref={gridAreaRef} darkMode={darkMode} mouseEnabled={mouseEnabled} onDebugCall={handleDebugCall} />

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
        <span className="mr-4">1. Write code to debug in the Code tab</span>
        <span className="mr-4">2. Set up visuals in the Visual Builder tab</span>
        <span>3. Click "Analyze" to trace and step through execution</span>
      </footer>
    </div>
  );
}

export default App;
