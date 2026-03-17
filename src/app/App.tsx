import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { CodeEditorArea } from './CodeEditorArea';
import { useTheme } from '../contexts/ThemeContext';
import { AnimationContext } from '../animation/animationContext';
import { loadPyodide, isPyodideLoaded, executePythonCode, executeDebugCall, resetPythonState } from '../python-engine/code-builder/services/pythonExecutor';
import { clearAll as clearTerminal, commitCurrentSegment, appendMarker, appendError } from '../output-terminal/terminalState';
import { ApiReferencePanel } from '../api/ApiReferencePanel';
import { TimelineControls } from '../timeline/TimelineControls';
import { GridArea, type GridAreaHandle } from './GridArea';
import { getStateAt, getMaxTime, getTimeline } from '../timeline/timelineState';
import { getCodeStepAt } from '../python-engine/debugger-panel/codeTimelineState';
import type { TextBox } from '../text-boxes/types';
import { migrateTextBox } from '../text-boxes/types';

const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// TODO: split samples into "public" (shipped in prod) and "dev" (local-only, e.g. rich-text-demo).
// Dev samples should only appear when import.meta.env.DEV is true.
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

const buttonLocal =
  `${buttonBase} bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-800/50 text-amber-800 dark:text-amber-300`;


function App() {
  const { darkMode, toggleDarkMode } = useTheme();

  const gridAreaRef = useRef<GridAreaHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [samplesOpen, setSamplesOpen] = useState(false);
  const [projectName, setProjectName] = useState('untitled');

  // Visual builder state
  const [visualBuilderCode, setVisualBuilderCode] = useState('');
  const [debuggerCode, setDebuggerCode] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeStatus, setAnalyzeStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const everAnalyzedRef = useRef(false);
  const autoLoadedRef = useRef(false);
  const [pyodideLoading, setPyodideLoading] = useState(false);
  const [pyodideReady, setPyodideReady] = useState(false);
  const [apiReferenceOpen, setApiReferenceOpen] = useState(false);
  const [saveSampleStatus, setSaveSampleStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [debugCallSuffix, setDebugCallSuffix] = useState<string | null>(null);
  const [textBoxes, setTextBoxes] = useState<TextBox[]>([]);
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [animationDuration, setAnimationDuration] = useState(600); // ms

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
    clearTerminal();
    resetPythonState();
  }, []);

  const isCodeEmpty = (code: string) =>
    code.split('\n').every((line) => {
      const trimmed = line.trim();
      return trimmed === '' || trimmed.startsWith('#');
    });

  const runAnalyze = useCallback(async (vbCode: string, dbgCode: string) => {
    setIsAnalyzing(true);
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
        setAnalyzeStatus('error');
      }
    } catch (err) {
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
    appendMarker(`----- debug call: ${expression} -----`);
    const result = await executeDebugCall(expression);
    if (result.error) {
      setAnalyzeStatus('error');
      setDebugCallSuffix(null);
      setAppMode('interactive');
      return;
    }
    if (result.success && getMaxTime() >= 0) {
      setStepCount(getMaxTime() + 1);
      setCurrentStep(0);
      const state = getStateAt(0);
      if (state) gridAreaRef.current?.loadVisualBuilderObjects(state);
    } else {
      setDebugCallSuffix(null);
      setAppMode('interactive');
    }
  }, []);

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
    const name = projectName.trim() || 'untitled';
    const data = {
      builderCode: visualBuilderCode,
      debuggerCode,
      breakpoints: [...breakpoints],
      textBoxes,
    };
    const content = JSON.stringify(data, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [visualBuilderCode, debuggerCode, breakpoints, textBoxes, projectName]);

  const handleSaveToSamples = useCallback(async () => {
    const name = projectName.trim() || 'untitled';
    const data = {
      builderCode: visualBuilderCode,
      debuggerCode,
      breakpoints: [...breakpoints],
      textBoxes,
    };
    const content = JSON.stringify(data, null, 2);
    setSaveSampleStatus('saving');
    try {
      const res = await fetch('/api/save-sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content }),
      });
      setSaveSampleStatus(res.ok ? 'saved' : 'error');
    } catch {
      setSaveSampleStatus('error');
    }
    setTimeout(() => setSaveSampleStatus('idle'), 2000);
  }, [visualBuilderCode, debuggerCode, breakpoints, textBoxes, projectName]);

  const handleLoad = useCallback((data: { builderCode?: string; debuggerCode?: string; breakpoints?: number[]; textBoxes?: TextBox[] }, name: string) => {
    if (!data.builderCode) {
      appendError('Invalid file: missing builderCode field');
      return;
    }
    setProjectName(name);
    setVisualBuilderCode(data.builderCode);
    setDebuggerCode(data.debuggerCode ?? '');
    setBreakpoints(data.breakpoints ? new Set(data.breakpoints) : new Set());
    setTextBoxes((data.textBoxes ?? [] as unknown[]).map((raw) => migrateTextBox(raw as Record<string, unknown>)));
    handleEdit();
  }, [handleEdit]);

  // Auto-load first sample and return to edit mode
  useEffect(() => {
    if (!pyodideReady || autoLoadedRef.current || SAMPLES.length === 0) return;
    autoLoadedRef.current = true;
    handleLoad(SAMPLES[0].data, SAMPLES[0].name);
  }, [pyodideReady, handleLoad]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name.replace(/\.json$/, '');
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        handleLoad(data, name);
      } catch {
        console.error('Failed to parse JSON file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [handleLoad]);

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts
  // ---------------------------------------------------------------------------

  // Capture phase so shortcuts fire even when Monaco editor has focus
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'Enter') {
        if (appMode === 'idle' && !isAnalyzing) {
          e.preventDefault();
          handleAnalyze();
        } else if (appMode === 'trace') {
          e.preventDefault();
          handleEnterInteractive();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [appMode, isAnalyzing, handleAnalyze, handleEnterInteractive]);

  return (
    <AnimationContext.Provider value={{ enabled: animationsEnabled, duration: animationDuration }}>
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

          {/* Project name */}
          <input
            type="text"
            value={projectName}
            onChange={e => setProjectName(e.target.value)}
            className="text-sm border-b border-gray-300 dark:border-gray-600 bg-transparent focus:outline-none focus:border-indigo-500 text-gray-700 dark:text-gray-200 w-36"
          />

          {/* Save / Load / Samples */}
          <button type="button" onClick={handleSave} className={buttonNeutral}>Save</button>
          <button type="button" onClick={() => fileInputRef.current?.click()} className={buttonNeutral}>Load</button>
          {IS_LOCAL && (
            <>
              <button type="button" onClick={handleSaveToSamples} disabled={saveSampleStatus === 'saving'} className={buttonLocal}>
                {saveSampleStatus === 'saving' ? 'Saving…' : 'Save to Samples'}
              </button>
              {saveSampleStatus === 'saved' && <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Saved!</span>}
              {saveSampleStatus === 'error' && <span className="text-xs text-red-600 dark:text-red-400 font-medium">Error</span>}
            </>
          )}
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
                      onClick={() => { handleLoad(data, name); setSamplesOpen(false); }}
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
          <div className={appMode === 'interactive' || appMode === 'idle' ? 'invisible' : ''}>
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

          {/* Animation speed slider — only shown in animated step mode */}
          {animationsEnabled && (appMode !== 'idle' ) && (
            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <input
                type="range"
                min={100} max={2000} step={100}
                value={animationDuration}
                onChange={(e) => setAnimationDuration(Number(e.target.value))}
                className="w-24 accent-blue-500"
                title="Animation duration"
              />
              <span className="w-10 text-right">{(animationDuration / 1000).toFixed(1)}s</span>
            </div>
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
                debuggerCode={debuggerCode + (debugCallSuffix ?? '')}
                onDebuggerCodeChange={appMode === 'debug_in_event' ? () => {} : setDebuggerCode}
                onAnalyze={handleAnalyze}
                onEdit={handleEdit}
                isAnalyzing={isAnalyzing}
                analyzeStatus={analyzeStatus}

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
