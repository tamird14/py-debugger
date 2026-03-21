import { useState, useCallback, useEffect, useRef, useMemo } from 'react';

import { Group, Panel, Separator } from 'react-resizable-panels';
import { CombinedEditor, COMBINED_SAMPLE, type CombinedEditorHandle } from '../components/combined-editor/CombinedEditor';
import { useTheme } from '../contexts/ThemeContext';
import { AnimationContext } from '../animation/animationContext';
import { loadPyodide, isPyodideLoaded, resetPythonState } from '../python-engine/code-builder/services/pythonExecutor';
import { clearAll as clearTerminal, commitCurrentSegment, appendError, setCombinedEditorSteps } from '../output-terminal/terminalState';
import { ApiReferencePanel } from '../api/ApiReferencePanel';
import { TimelineControls } from '../timeline/TimelineControls';
import { ExtrasMenu } from './ExtrasMenu';
import { GridArea, type GridAreaHandle } from './GridArea';
import { getStateAt, getMaxTime, clearTimeline, hydrateTimelineFromArray } from '../timeline/timelineState';
import { clearCodeTimeline, setCodeTimeline } from '../python-engine/debugger-panel/codeTimelineState';
import { executeCombinedCode, type CombinedStep, type CombinedClickResult } from '../components/combined-editor/combinedExecutor';
import { setHandlers, hasAnyClickHandler } from '../visual-panel/handlersState';
import { getVizRanges } from '../components/combined-editor/vizBlockParser';
import type { TextBox } from '../text-boxes/types';
import { migrateTextBox } from '../text-boxes/types';

const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const AUTO_ANALYZE_ON_LOAD = true; // set to false to disable auto-analyze when loading a file

// TODO: split samples into "public" (shipped in prod) and "dev" (local-only, e.g. rich-text-demo).
// Dev samples should only appear when import.meta.env.DEV is true.
const SAMPLE_MODULES = import.meta.glob('../components/combined-editor/samples/*.json', { eager: true }) as Record<
  string,
  { combinedCode?: string; textBoxes?: TextBox[] }
>;
const SAMPLES = Object.entries(SAMPLE_MODULES).map(([path, data]) => {
  const filename = path.split('/').pop() ?? path;
  const rawName = filename.replace(/\.json$/, '');
  const isFeature = rawName.startsWith('feature-');
  return {
    displayName: isFeature ? rawName.slice('feature-'.length) : rawName,
    rawName,
    data,
    category: isFeature ? ('feature' as const) : ('algorithm' as const),
  };
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
  const combinedEditorRef = useRef<CombinedEditorHandle>(null);
  const pendingPostLoadRef = useRef(false);
  const [samplesOpen, setSamplesOpen] = useState(false);
  const [projectName, setProjectName] = useState('untitled');

  const autoLoadedRef = useRef(false);
  const [pyodideLoading, setPyodideLoading] = useState(false);
  const [pyodideReady, setPyodideReady] = useState(false);
  const [apiReferenceOpen, setApiReferenceOpen] = useState(false);
  const [saveSampleStatus, setSaveSampleStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [textBoxes, setTextBoxes] = useState<TextBox[]>([]);
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [animationDuration, setAnimationDuration] = useState(500); // ms

  // Combined editor state
  const [combinedCode, setCombinedCode] = useState(COMBINED_SAMPLE);
  const [combinedTimeline, setCombinedTimeline] = useState<CombinedStep[]>([]);
  const [interactiveLineNumbers, setInteractiveLineNumbers] = useState<(number | undefined)[]>([]);
  const [isCombinedEditable, setIsCombinedEditable] = useState(true);
  const [isAnalyzingCombined, setIsAnalyzingCombined] = useState(false);

  type AppMode = 'idle' | 'trace' | 'interactive' | 'debug_in_event';
  const [appMode, setAppMode] = useState<AppMode>('idle');
  const mouseEnabled = appMode === 'interactive';

  // Timeline state
  const [currentStep, setCurrentStep] = useState(0);
  const [stepCount, setStepCount] = useState(0);
  const [hasInteractiveElements, setHasInteractiveElements] = useState(false);
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


  const goToStep = useCallback((step: number) => {
    const clamped = Math.max(0, Math.min(getMaxTime(), step));
    const state = getStateAt(clamped);
    if (state) gridAreaRef.current?.loadVisualBuilderObjects(state);
    setCurrentStep(clamped);
  }, []);

  // ---------------------------------------------------------------------------
  // Main Flow
  // ---------------------------------------------------------------------------

  const handleReset = useCallback(() => {
    clearTerminal();
    resetPythonState();
    clearTimeline();
    clearCodeTimeline();
    setCurrentStep(0);
    setStepCount(0);
    gridAreaRef.current?.loadVisualBuilderObjects([]);
    setProjectName('untitled');
    setTextBoxes([]);
    setCombinedCode('');
    setCombinedTimeline([]);
    setIsCombinedEditable(true);
    setHandlers({});
    setHasInteractiveElements(false);
    setAppMode('idle');
  }, []);

  const enterInteractive = useCallback((from: 'trace' | 'debug') => {
    goToStep(getMaxTime());
    commitCurrentSegment(from === 'debug' ? '----- end debug call -----' : '----- end trace -----');
    setAppMode('interactive');
  }, [goToStep]);

  const handleEnterInteractive = useCallback(() => enterInteractive('trace'), [enterInteractive]);
  const handleBackToInteractive = useCallback(() => enterInteractive('debug'), [enterInteractive]);


  // ---------------------------------------------------------------------------
  // Combined editor handlers
  // ---------------------------------------------------------------------------

  const handleAnalyzeCombined = useCallback(async () => {
    if (!combinedCode.trim()) return;
    setIsAnalyzingCombined(true);
    clearTerminal();
    try {
      const result = await executeCombinedCode(combinedCode);
      if (result.success) {
        setCombinedTimeline(result.timeline);
        hydrateTimelineFromArray(result.timeline.map(s => s.visual));
        setCodeTimeline(result.timeline.map(s => ({ variables: s.variables, scope: [] })));
        setHandlers(result.handlers ?? {});
        const hasInteractive = hasAnyClickHandler();
        setHasInteractiveElements(hasInteractive);
        const isOneFrame = getMaxTime() === 0;
        setStepCount(getMaxTime() + 1);
        setCurrentStep(0);
        gridAreaRef.current?.loadVisualBuilderObjects(getStateAt(0) ?? []);
        setCombinedEditorSteps(
          result.timeline.map(s => ({ text: s.output ?? '', isViz: s.isViz ?? false }))
        );
        setIsCombinedEditable(false);
        if (isOneFrame && hasInteractive) {
          commitCurrentSegment('----- end trace -----');
          setAppMode('interactive');
        } else {
          setAppMode('trace');
        }
      } else {
        appendError(result.error ?? 'Unknown error');
      }
    } catch (err) {
      appendError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsAnalyzingCombined(false);
    }
  }, [combinedCode]);

  const handleEditCombined = useCallback(() => {
    setIsCombinedEditable(true);
    setCombinedTimeline([]);
    clearTerminal();
    clearTimeline();
    clearCodeTimeline();
    setHandlers({});
    setHasInteractiveElements(false);
    setCurrentStep(0);
    setStepCount(0);
    gridAreaRef.current?.loadVisualBuilderObjects([]);
    setAppMode('idle');
  }, []);

  const handleCombinedTrace = useCallback((result: CombinedClickResult) => {
    // A click handler traced into algorithm code — load the mini-timeline and enter stepping mode.
    // Append final snapshot as last step so goToStep(getMaxTime()) in handleBackToInteractive
    // restores the correct post-click visual state.
    const allSteps = [
      ...result.interactiveTimeline,
      { visual: result.finalSnapshot, variables: {}, line: undefined },
    ];
    hydrateTimelineFromArray(allSteps.map(s => s.visual));
    setInteractiveLineNumbers(allSteps.map(s => s.line));
    setStepCount(allSteps.length);
    goToStep(0);
    setAppMode('debug_in_event');
  }, [goToStep]);

  // viz block ranges for the current combined code; stable until code changes
  const combinedVizRanges = useMemo(() => getVizRanges(combinedCode), [combinedCode]);

  // ---------------------------------------------------------------------------
  // Load \ Save
  // ---------------------------------------------------------------------------

  const handleSave = useCallback(() => {
    const name = projectName.trim() || 'untitled';
    const data = { combinedCode, textBoxes };
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
  }, [combinedCode, textBoxes, projectName]);

  const handleSaveToSamples = useCallback(async () => {
    const name = projectName.trim() || 'untitled';
    const data = { combinedCode, textBoxes };
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
  }, [combinedCode, textBoxes, projectName]);

  const handleLoad = useCallback((data: { combinedCode?: string; textBoxes?: TextBox[] }, name: string) => {
    if (!data.combinedCode) {
      appendError('Invalid file: missing combinedCode field');
      return;
    }
    handleReset();
    setProjectName(name);
    setCombinedCode(data.combinedCode);
    setTextBoxes((data.textBoxes ?? [] as unknown[]).map((raw) => migrateTextBox(raw as Record<string, unknown>)));
    pendingPostLoadRef.current = true;
  }, [handleReset]);

  // After a load, fold viz blocks and optionally auto-analyze
  useEffect(() => {
    if (!pendingPostLoadRef.current || !combinedCode.trim()) return;
    pendingPostLoadRef.current = false;
    // rAF lets Monaco finish computing folding ranges before we trigger fold
    requestAnimationFrame(() => combinedEditorRef.current?.foldVizBlocks());
    if (AUTO_ANALYZE_ON_LOAD) handleAnalyzeCombined();
  }, [combinedCode, handleAnalyzeCombined]);

  // Auto-load first sample and return to edit mode
  useEffect(() => {
    if (!pyodideReady || autoLoadedRef.current || SAMPLES.length === 0) return;
    autoLoadedRef.current = true;
    handleLoad(SAMPLES[0].data, SAMPLES[0].rawName);
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
      if (e.key === 's') {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'Enter') {
        if (appMode === 'idle' && !isAnalyzingCombined) {
          e.preventDefault();
          handleAnalyzeCombined();
        } else if (appMode === 'trace' && hasInteractiveElements) {
          e.preventDefault();
          handleEnterInteractive();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [appMode, isAnalyzingCombined, handleAnalyzeCombined, handleEnterInteractive, handleSave]);

  return (
    <AnimationContext.Provider value={{ enabled: animationsEnabled, duration: animationDuration }}>
    <div className="w-screen h-screen overflow-hidden flex flex-col bg-gray-100 dark:bg-gray-900 dark:text-gray-100">
      {/* Header */}
      <header className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 grid grid-cols-3 items-center shadow-sm">
        {/* Left: project name + samples */}
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={projectName}
            onChange={e => setProjectName(e.target.value)}
            className="text-sm border-b border-gray-300 dark:border-gray-600 bg-transparent focus:outline-none focus:border-indigo-500 text-gray-700 dark:text-gray-200 w-36"
          />
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} className="hidden" />
          <div className="relative">
            <button type="button" onClick={() => setSamplesOpen((o) => !o)} className={buttonNeutral}>
              Samples
            </button>
            {samplesOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSamplesOpen(false)} />
                <div className="absolute left-0 top-full mt-1 z-50 min-w-[180px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg py-1">
                  <div className="px-3 py-1 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Algorithms</div>
                  {SAMPLES.filter(s => s.category === 'algorithm').map(({ displayName, rawName, data }) => (
                    <button
                      key={rawName}
                      type="button"
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      onClick={() => { handleLoad(data, rawName); setSamplesOpen(false); }}
                    >
                      {displayName}
                    </button>
                  ))}
                  <div className="my-1 border-t border-gray-200 dark:border-gray-600" />
                  <div className="px-3 py-1 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Features</div>
                  {SAMPLES.filter(s => s.category === 'feature').map(({ displayName, rawName, data }) => (
                    <button
                      key={rawName}
                      type="button"
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      onClick={() => { handleLoad(data, rawName); setSamplesOpen(false); }}
                    >
                      {displayName}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Center: pyodide status + timeline controls */}
        <div className="flex items-center justify-center gap-3">
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
          <TimelineControls
            currentStep={currentStep}
            stepCount={stepCount}
            onGoToStep={goToStep}
            appMode={appMode}
            onEnterInteractive={handleEnterInteractive}
            onBackToInteractive={handleBackToInteractive}
            onAnalyze={handleAnalyzeCombined}
            isAnalyzing={isAnalyzingCombined}
            canAnalyze={!!combinedCode.trim()}
            hasInteractiveElements={hasInteractiveElements}
            isStaticSnapshot={stepCount === 1 && !hasInteractiveElements && appMode !== 'idle'}
          />
        </div>

        {/* Right: API reference + extras */}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setApiReferenceOpen((o) => !o)}
            className={`${buttonNeutral} min-w-[90px]`}
          >
            {apiReferenceOpen ? 'Hide' : 'Show'} API
          </button>
          <ExtrasMenu
            darkMode={darkMode}
            onToggleDark={toggleDarkMode}
            animationsEnabled={animationsEnabled}
            onToggleAnimations={() => setAnimationsEnabled((v) => !v)}
            animationDuration={animationDuration}
            onAnimationDurationChange={setAnimationDuration}
            appMode={appMode}
            onNew={handleReset}
            onSave={handleSave}
            onLoad={() => fileInputRef.current?.click()}
            isLocal={IS_LOCAL}
            onSaveToSamples={handleSaveToSamples}
            saveSampleStatus={saveSampleStatus}
          />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        <Group orientation="horizontal" className="h-full">
          {/* Left panel - Code Editor */}
          <Panel defaultSize={50} minSize={20}>
            <div className="h-full border-r border-gray-300 dark:border-gray-600">
              <CombinedEditor
                  ref={combinedEditorRef}
                  code={combinedCode}
                  onChange={setCombinedCode}
                  isEditable={isCombinedEditable}
                  currentStep={combinedTimeline.length > 0 ? currentStep : undefined}
                  currentLine={
                    appMode === 'trace' && combinedTimeline.length > 0 ? combinedTimeline[currentStep]?.line :
                    appMode === 'debug_in_event' ? interactiveLineNumbers[currentStep] :
                    undefined
                  }
                  appMode={appMode}
                  onEdit={handleEditCombined}
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
                textBoxes={textBoxes}
                onTextBoxesChange={setTextBoxes}
                combinedVizRanges={combinedVizRanges}
                onCombinedTrace={handleCombinedTrace}
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
