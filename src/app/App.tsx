import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { CodeEditorArea } from './CodeEditorArea';
import { useTheme } from '../contexts/ThemeContext';
import { AnimationContext } from '../animation/animationContext';
import { loadPyodide, isPyodideLoaded, executePythonCode, executeDebugCall } from '../code-builder/services/pythonExecutor';
import { clearAll as clearTerminal, commitCurrentSegment, appendMarker } from '../output-terminal/terminalState';
import { ApiReferencePanel } from '../api/ApiReferencePanel';
import { TimelineControls } from '../timeline/TimelineControls';
import { GridArea, type GridAreaHandle } from './GridArea';
import { getStateAt, getMaxTime, getTimeline } from '../timeline/timelineState';
import { getCodeStepAt } from '../debugger-panel/codeTimelineState';
import SAMPLE_VISUAL_BUILDER from '../code-builder/sample.py?raw';
import SAMPLE_DEBUGGER from '../debugger-panel/debuggerSample.py?raw';
import type { TextBox } from '../text-boxes/types';

const SAMPLE_MODULES = import.meta.glob('../samples/*.json', { eager: true }) as Record<
  string,
  { builderCode?: string; debuggerCode?: string; breakpoints?: number[]; textBoxes?: TextBox[] }
>;
const SAMPLES = Object.entries(SAMPLE_MODULES).map(([path, data]) => {
  const filename = path.split('/').pop() ?? path;
  return { name: filename.replace(/\.json$/, ''), data };
});

/* ---------- Shared Tailwind class groups ---------- */

const buttonBase =
  'px-3 py-1 rounded text-sm font-medium transition-colors';

const buttonNeutral =
  `${buttonBase} bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600`;


function App() {
  const { darkMode, toggleDarkMode } = useTheme();

  const gridAreaRef = useRef<GridAreaHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [samplesOpen, setSamplesOpen] = useState(false);

  // Visual builder state
  const [visualBuilderCode, setVisualBuilderCode] = useState(SAMPLE_VISUAL_BUILDER);
  const [debuggerCode, setDebuggerCode] = useState(SAMPLE_DEBUGGER);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | undefined>();
  const [analyzeStatus, setAnalyzeStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const everAnalyzedRef = useRef(false);
  const [pyodideLoading, setPyodideLoading] = useState(false);
  const [pyodideReady, setPyodideReady] = useState(false);
  const [apiReferenceOpen, setApiReferenceOpen] = useState(false);

  const [debugCallSuffix, setDebugCallSuffix] = useState<string | null>(null);
  const [textBoxes, setTextBoxes] = useState<TextBox[]>([]);
  const [animationsEnabled, setAnimationsEnabled] = useState(true);

  type AppMode = 'idle' | 'trace' | 'interactive' | 'debug_in_event';
  const [appMode, setAppMode] = useState<AppMode>('idle');
  const mouseEnabled = appMode === 'interactive';

  // Timeline state
  const [currentStep, setCurrentStep] = useState(0);
  const [stepCount, setStepCount] = useState(0);
  const [breakpoints, setBreakpoints] = useState<Set<number>>(new Set());

  // Mark dirty whenever code changes after a completed analysis
  useEffect(() => {
    if (everAnalyzedRef.current) setAnalyzeStatus('idle');
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

  // ---------------------------------------------------------------------------
  // Timeline
  // ---------------------------------------------------------------------------

  const getStepLine = (step: number) => {
    const scope = getCodeStepAt(step)?.scope ?? [];
    return scope.length > 0 ? scope[scope.length - 1][1] : null;
  };

  const goToStep = useCallback((step: number) => {
    const clamped = Math.max(0, Math.min(getMaxTime(), step));
    const state = getStateAt(clamped);
    if (state) gridAreaRef.current?.loadVisualBuilderObjects(state);
    setCurrentStep(clamped);
  }, []);

  // ---------------------------------------------------------------------------
  // Main Flow
  // ---------------------------------------------------------------------------

  const handleEdit = useCallback(() => {
    setDebugCallSuffix(null);
    setAnalyzeStatus('idle');
    setAppMode('idle');
  }, []);

  const isCodeEmpty = (code: string) =>
    code.split('\n').every((line) => {
      const trimmed = line.trim();
      return trimmed === '' || trimmed.startsWith('#');
    });

  const runAnalyze = useCallback(async (vbCode: string, dbgCode: string) => {
    setIsAnalyzing(true);
    setAnalyzeError(undefined);
    clearTerminal();

    try {
      const result = await executePythonCode(vbCode, dbgCode);

      if (result.success) {
        const skipTrace = isCodeEmpty(dbgCode);
        setStepCount(getMaxTime() + 1);
        setCurrentStep(skipTrace ? getMaxTime() : 0);
        gridAreaRef.current?.loadVisualBuilderObjects(
          skipTrace ? getTimeline()[getMaxTime()] ?? getTimeline()[0] : getTimeline()[0]
        );
        setAnalyzeStatus('success');
        setAppMode(skipTrace ? 'interactive' : 'trace');
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
  }, []);

  const handleAnalyze = useCallback(() => {
    return runAnalyze(visualBuilderCode, debuggerCode);
  }, [visualBuilderCode, debuggerCode, runAnalyze]);

  const enterInteractive = useCallback((from: 'trace' | 'debug') => {
    if (from === 'debug') setDebugCallSuffix(null);
    goToStep(getMaxTime());
    commitCurrentSegment(from === 'debug' ? '----- end debug call -----' : '----- end trace -----');
    setAppMode('interactive');
  }, [goToStep]);

  const handleEnterInteractive = useCallback(() => enterInteractive('trace'), [enterInteractive]);
  const handleBackToInteractive = useCallback(() => enterInteractive('debug'), [enterInteractive]);

  const handleDebugCall = useCallback(async (expression: string) => {
    setAppMode('debug_in_event');
    const indented = expression.split('\n').map(l => '    ' + l).join('\n');
    const suffix = `\n\ndef debug_call():\n${indented}`;
    setDebugCallSuffix(suffix);
    const lineOffset = debuggerCode.split('\n').length + 2;
    appendMarker(`----- debug call: ${expression} -----`);
    const result = await executeDebugCall(expression, lineOffset);
    if (result?.error) {
      setAnalyzeError(result.error);
      setAnalyzeStatus('error');
      setDebugCallSuffix(null);
      setAppMode('interactive');
      return;
    }
    if (result && result.stepCount > 0) {
      setStepCount(result.stepCount);
      setCurrentStep(0);
      const state = getStateAt(0);
      if (state) gridAreaRef.current?.loadVisualBuilderObjects(state);
    } else {
      setDebugCallSuffix(null);
      setAppMode('interactive');
    }
  }, [debuggerCode]);

  // ---------------------------------------------------------------------------
  // Editor state (variables, highlighted lines)
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Load \ Save
  // ---------------------------------------------------------------------------

  const handleSave = useCallback(() => {
    const data = {
      builderCode: visualBuilderCode,
      debuggerCode,
      breakpoints: [...breakpoints],
      textBoxes,
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
  }, [visualBuilderCode, debuggerCode, breakpoints]);

  const handleLoad = useCallback(async (data: { builderCode?: string; debuggerCode?: string; breakpoints?: number[]; textBoxes?: TextBox[] }) => {
    if (!data.builderCode) {
      setAnalyzeError('Invalid file: missing builderCode field');
      return;
    }
    const dbgCode = data.debuggerCode ?? '';
    setVisualBuilderCode(data.builderCode);
    setDebuggerCode(dbgCode);
    setBreakpoints(data.breakpoints ? new Set(data.breakpoints) : new Set());
    setTextBoxes(data.textBoxes ?? []);
    await runAnalyze(data.builderCode, dbgCode);
  }, [runAnalyze]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        handleLoad(data);
      } catch {
        console.error('Failed to parse JSON file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [handleLoad]);


  return (
    <AnimationContext.Provider value={animationsEnabled}>
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

          {/* Save / Load / Samples */}
          <button type="button" onClick={handleSave} className={buttonNeutral}>Save</button>
          <button type="button" onClick={() => fileInputRef.current?.click()} className={buttonNeutral}>Load</button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} className="hidden" />
          <div className="relative">
            <button type="button" onClick={() => setSamplesOpen((o) => !o)} className={buttonNeutral}>
              Samples
            </button>
            {samplesOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSamplesOpen(false)} />
                <div className="absolute left-0 top-full mt-1 z-50 min-w-[160px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg">
                  {SAMPLES.map(({ name, data }) => (
                    <button
                      key={name}
                      type="button"
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      onClick={() => { handleLoad(data); setSamplesOpen(false); }}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
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

          {/* Timeline controls — invisible in interactive mode to keep header height stable */}
          <div className={appMode === 'interactive' ? 'invisible' : ''}>
            <TimelineControls
              currentStep={currentStep}
              stepCount={stepCount}
              onGoToStep={goToStep}
              getStepLine={getStepLine}
              breakpoints={breakpoints}
            />
          </div>

          {/* Animation mode toggle */}
          <button
            onClick={() => setAnimationsEnabled((v) => !v)}
            className={buttonNeutral}
            title={animationsEnabled ? 'Switch to instant jumps' : 'Switch to smooth animations'}
          >
            {animationsEnabled ? 'Animated' : 'Jump'}
          </button>

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
                debuggerCode={debuggerCode + (debugCallSuffix ?? '')}
                onDebuggerCodeChange={appMode === 'debug_in_event' ? () => {} : setDebuggerCode}
                onAnalyze={handleAnalyze}
                onEdit={handleEdit}
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
                currentStep={currentStep}
              />
            </div>
          </Panel>

          <Separator className="w-1 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 cursor-col-resize" />

          {/* Right panel - Grid Area */}
          <Panel defaultSize={50} minSize={20}>
            <div className="h-full relative">
              <GridArea
                ref={gridAreaRef}
                darkMode={darkMode}
                mouseEnabled={mouseEnabled}
                onDebugCall={handleDebugCall}
                textBoxes={textBoxes}
                onTextBoxesChange={setTextBoxes}
              />

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
      </footer>
    </div>
    </AnimationContext.Provider>
  );
}

export default App;
