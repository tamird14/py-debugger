import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimationContext } from '../animation/animationContext';
import { loadPyodide, isPyodideLoaded } from '../python-engine/code-builder/services/pythonExecutor';
import { TimelineControls } from '../timeline/TimelineControls';
import { GridArea, type GridAreaHandle } from './GridArea';
import { getStateAt, getMaxTime, clearTimeline, hydrateTimelineFromArray } from '../timeline/timelineState';
import { executeCombinedCode, type CombinedStep, type CombinedClickResult } from '../components/combined-editor/combinedExecutor';
import { setHandlers } from '../visual-panel/handlersState';
import { getVizRanges } from '../components/combined-editor/vizBlockParser';
import { migrateTextBox, type TextBox } from '../text-boxes/types';

// ---------------------------------------------------------------------------
// Sample registry (same pattern as App.tsx)
// ---------------------------------------------------------------------------

const SAMPLE_MODULES = import.meta.glob('../components/combined-editor/samples/*.json', { eager: true }) as Record<
  string,
  { combinedCode?: string; textBoxes?: TextBox[] }
>;
const SAMPLES = Object.entries(SAMPLE_MODULES).map(([path, data]) => {
  const filename = path.split('/').pop() ?? path;
  const rawName = filename.replace(/\.json$/, '');
  return { rawName, data };
});

// ---------------------------------------------------------------------------
// EmbedPage
// ---------------------------------------------------------------------------

type AppMode = 'idle' | 'trace' | 'interactive' | 'debug_in_event';

export function EmbedPage() {
  const [searchParams] = useSearchParams();
  const sampleParam = searchParams.get('sample') ?? '';
  const darkParam = searchParams.get('dark');

  // Resolve dark mode: ?dark=1 → dark, ?dark=0 → light, absent → system
  const prefersDark = useMemo(() => {
    if (darkParam === '1') return true;
    if (darkParam === '0') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }, [darkParam]);

  // Resolve sample
  const sample = SAMPLES.find((s) => s.rawName === sampleParam);

  // Grid ref
  const gridAreaRef = useRef<GridAreaHandle>(null);

  // Pyodide state
  const [pyodideReady, setPyodideReady] = useState(false);
  const [pyodideLoading, setPyodideLoading] = useState(false);

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Timeline + mode state
  const [appMode, setAppMode] = useState<AppMode>('idle');
  const [currentStep, setCurrentStep] = useState(0);
  const [stepCount, setStepCount] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_combinedTimeline, setCombinedTimeline] = useState<CombinedStep[]>([]);
  const [textBoxes, setTextBoxes] = useState<TextBox[]>([]);

  const mouseEnabled = appMode === 'interactive';

  // Viz ranges for click handler dispatch
  const combinedVizRanges = useMemo(
    () => (sample?.data.combinedCode ? getVizRanges(sample.data.combinedCode) : []),
    [sample]
  );

  // ---------------------------------------------------------------------------
  // Pyodide loading
  // ---------------------------------------------------------------------------

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
          setAnalysisError('Failed to load Python runtime.');
        });
    } else {
      setPyodideReady(true);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Analysis
  // ---------------------------------------------------------------------------

  const runAnalysis = useCallback(async (code: string, initialTextBoxes: TextBox[]) => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    clearTimeline();
    setHandlers({});
    setCurrentStep(0);
    setStepCount(0);
    gridAreaRef.current?.loadVisualBuilderObjects([]);
    setTextBoxes(initialTextBoxes);

    try {
      const result = await executeCombinedCode(code);
      if (result.success) {
        setCombinedTimeline(result.timeline);
        hydrateTimelineFromArray(result.timeline.map((s) => s.visual));
        setHandlers(result.handlers ?? {});
        setStepCount(getMaxTime() + 1);
        setCurrentStep(0);
        gridAreaRef.current?.loadVisualBuilderObjects(getStateAt(0) ?? []);
        setAppMode('trace');
      } else {
        setAnalysisError(result.error ?? 'Analysis failed.');
      }
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  // Auto-analyze when Pyodide is ready
  useEffect(() => {
    if (!pyodideReady || !sample) return;
    const code = sample.data.combinedCode;
    if (!code) return;
    const boxes = (sample.data.textBoxes ?? []).map((raw) => migrateTextBox(raw as Record<string, unknown>));
    runAnalysis(code, boxes);
  // Only run once when pyodide becomes ready for the current sample
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pyodideReady]);

  // ---------------------------------------------------------------------------
  // Timeline navigation
  // ---------------------------------------------------------------------------

  const goToStep = useCallback((step: number) => {
    const clamped = Math.max(0, Math.min(getMaxTime(), step));
    const state = getStateAt(clamped);
    if (state) gridAreaRef.current?.loadVisualBuilderObjects(state);
    setCurrentStep(clamped);
  }, []);

  // ---------------------------------------------------------------------------
  // Mode transitions
  // ---------------------------------------------------------------------------

  const handleEnterInteractive = useCallback(() => {
    goToStep(getMaxTime());
    setAppMode('interactive');
  }, [goToStep]);

  const handleBackToInteractive = useCallback(() => {
    goToStep(getMaxTime());
    setAppMode('interactive');
  }, [goToStep]);

  const handleCombinedTrace = useCallback((result: CombinedClickResult) => {
    const allSteps = [
      ...result.interactiveTimeline,
      { visual: result.finalSnapshot, variables: {}, line: undefined },
    ];
    hydrateTimelineFromArray(allSteps.map((s) => s.visual));
    setStepCount(allSteps.length);
    goToStep(0);
    setAppMode('debug_in_event');
  }, [goToStep]);

  // ---------------------------------------------------------------------------
  // Loading / error state
  // ---------------------------------------------------------------------------

  const isLoading = pyodideLoading || isAnalyzing;
  const loadingMessage = pyodideLoading
    ? 'Loading Python runtime…'
    : isAnalyzing
    ? 'Analyzing…'
    : '';

  if (!sample) {
    return (
      <EmbedShell prefersDark={prefersDark} sampleName={sampleParam || '(none)'}>
        <div className="flex flex-1 items-center justify-center text-red-500 dark:text-red-400 text-sm">
          {sampleParam
            ? `Sample "${sampleParam}" not found.`
            : 'No sample specified. Use ?sample=<name> in the URL.'}
        </div>
      </EmbedShell>
    );
  }

  return (
    <EmbedShell prefersDark={prefersDark} sampleName={sample.rawName}>
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/80 dark:bg-gray-900/80 gap-3">
          <svg className="animate-spin w-6 h-6 text-indigo-500" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <span className="text-sm text-gray-600 dark:text-gray-300">{loadingMessage}</span>
        </div>
      )}

      {/* Error banner */}
      {analysisError && !isLoading && (
        <div className="flex-shrink-0 px-4 py-2 bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 text-sm">
          {analysisError}
        </div>
      )}

      {/* Grid — fills remaining space */}
      <div className="flex-1 min-h-0 relative">
        <AnimationContext.Provider value={{ enabled: true, duration: 300 }}>
          <GridArea
            ref={gridAreaRef}
            darkMode={prefersDark}
            mouseEnabled={mouseEnabled}
            textBoxes={textBoxes}
            onTextBoxesChange={setTextBoxes}
            combinedVizRanges={combinedVizRanges}
            onCombinedTrace={handleCombinedTrace}
          />
        </AnimationContext.Provider>
      </div>

      {/* Footer: timeline controls */}
      <div className="flex-shrink-0 px-4 py-2 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex items-center justify-center">
        <TimelineControls
          currentStep={currentStep}
          stepCount={stepCount}
          onGoToStep={goToStep}
          appMode={appMode}
          onEnterInteractive={handleEnterInteractive}
          onBackToInteractive={handleBackToInteractive}
        />
      </div>
    </EmbedShell>
  );
}

// ---------------------------------------------------------------------------
// EmbedShell — layout wrapper
// ---------------------------------------------------------------------------

function EmbedShell({
  prefersDark,
  sampleName,
  children,
}: {
  prefersDark: boolean;
  sampleName: string;
  children: React.ReactNode;
}) {
  const appUrl = window.location.origin + `/?sample=${encodeURIComponent(sampleName)}`;

  return (
    <div className={`${prefersDark ? 'dark' : ''} flex flex-col h-screen w-screen overflow-hidden bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100`}>
      {/* Header */}
      <header className="flex-shrink-0 px-4 py-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <a
            href="/"
            className="text-indigo-600 dark:text-indigo-400 font-semibold text-sm hover:underline flex-shrink-0"
          >
            py-debugger
          </a>
          <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">·</span>
          <span className="text-sm text-gray-700 dark:text-gray-200 truncate">{sampleName}</span>
        </div>
        <a
          href={appUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 text-xs px-2.5 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          Open full app ↗
        </a>
      </header>

      {/* Body (relative so loading overlay works) */}
      <div className="flex flex-col flex-1 min-h-0 relative">
        {children}
      </div>
    </div>
  );
}
