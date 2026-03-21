import { useState, useEffect, useCallback } from 'react';
import { MousePointerClick } from 'lucide-react';

interface TimelineControlsProps {
  currentStep: number;
  stepCount: number;
  onGoToStep: (step: number) => void;
  appMode?: string;
  onEnterInteractive?: () => void;
  onBackToInteractive?: () => void;
  onAnalyze?: () => void;
  isAnalyzing?: boolean;
  canAnalyze?: boolean;
  /** False = show the Go-Interactive button disabled (no interactive elements exist) */
  hasInteractiveElements?: boolean;
  /** True = gray out entire timeline nav (single-frame, no interaction — "photo" mode) */
  isStaticSnapshot?: boolean;
}

export function TimelineControls({
  currentStep,
  stepCount,
  onGoToStep,
  appMode,
  onEnterInteractive,
  onBackToInteractive,
  onAnalyze,
  isAnalyzing,
  canAnalyze,
  hasInteractiveElements,
  isStaticSnapshot,
}: TimelineControlsProps) {
  const [inputValue, setInputValue] = useState(String(currentStep));

  useEffect(() => {
    setInputValue(String(currentStep));
  }, [currentStep]);

  const onPrevStep = useCallback(() => onGoToStep(currentStep - 1), [currentStep, onGoToStep]);
  const onNextStep = useCallback(() => onGoToStep(currentStep + 1), [currentStep, onGoToStep]);

  const hasSteps = stepCount > 0;
  const maxStep = hasSteps ? stepCount - 1 : 0;
  const isInactive = appMode === 'idle' || appMode === 'interactive';
  const isPhoto = isStaticSnapshot ?? false;
  const canEnterInteractive = hasInteractiveElements !== false;
  const canGoPrev = hasSteps && currentStep > 0 && !isInactive && !isPhoto;
  const canGoNext = hasSteps && currentStep < maxStep && !isInactive && !isPhoto;

  const btnBase =
    'px-2 py-1 rounded text-sm font-medium transition-colors border';
  const btnActive =
    `${btnBase} bg-white dark:bg-gray-600 hover:bg-gray-100 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-500`;
  const btnDisabled =
    `${btnBase} bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-600 cursor-not-allowed`;

  const commitInput = () => {
    if (!hasSteps || isInactive) return;
    const val = parseInt(inputValue, 10);
    if (!isNaN(val) && val >= 0 && val <= maxStep) {
      onGoToStep(val);
    } else {
      setInputValue(String(currentStep));
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      {/* Analyze button — only in idle mode */}
      {appMode === 'idle' && onAnalyze && (
        <button
          type="button"
          onClick={onAnalyze}
          disabled={isAnalyzing || !canAnalyze}
          className={`px-3 py-1 rounded text-sm font-medium border transition-colors ${
            isAnalyzing || !canAnalyze
              ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-600 cursor-not-allowed'
              : 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-500 hover:border-indigo-500'
          }`}
          title="Analyze code (Ctrl+Enter)"
        >
          {isAnalyzing ? (
            <span className="flex items-center gap-1.5">
              <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Analyzing...
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
              Analyze
            </span>
          )}
        </button>
      )}

      {/* Step navigation — always visible, grayed out when idle/interactive or photo */}
      <div className={`flex items-center gap-1 px-3 py-1 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 ${(isInactive || isPhoto) ? 'opacity-40' : ''}`}>
        <button
          onClick={() => onGoToStep(0)}
          disabled={!canGoPrev}
          className={canGoPrev ? btnActive : btnDisabled}
          title="First step"
        >
          {'<<'}
        </button>
        <button
          onClick={onPrevStep}
          disabled={!canGoPrev}
          className={canGoPrev ? btnActive : btnDisabled}
          title="Previous step"
        >
          ←
        </button>

        <input
          type={hasSteps ? 'number' : 'text'}
          min={0}
          max={maxStep}
          value={hasSteps ? inputValue : '--'}
          readOnly={!hasSteps || isInactive}
          onChange={(e) => { if (hasSteps && !isInactive) setInputValue(e.target.value); }}
          onBlur={commitInput}
          onKeyDown={(e) => { if (e.key === 'Enter') commitInput(); }}
          className="w-14 text-center text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-500 rounded px-1 py-0.5 text-gray-700 dark:text-gray-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          title={hasSteps ? `Step (0 – ${maxStep})` : 'No steps yet'}
        />
        <span className="text-xs text-gray-500 dark:text-gray-400">/ {hasSteps ? maxStep : '--'}</span>

        <button
          onClick={onNextStep}
          disabled={!canGoNext}
          className={canGoNext ? btnActive : btnDisabled}
          title="Next step"
        >
          →
        </button>
        <button
          onClick={() => onGoToStep(maxStep)}
          disabled={!canGoNext}
          className={canGoNext ? btnActive : btnDisabled}
          title="Last step"
        >
          {'>>'}
        </button>

        {appMode === 'trace' && onEnterInteractive && (
          <>
            <div className="w-px h-5 bg-gray-300 dark:bg-gray-500 mx-0.5" />
            <button
              onClick={canEnterInteractive ? onEnterInteractive : undefined}
              disabled={!canEnterInteractive}
              className={canEnterInteractive ? btnActive : btnDisabled}
              title={canEnterInteractive ? "Finish trace and enter interactive mode" : "No interactive elements"}
            >
              <MousePointerClick size={14} />
            </button>
          </>
        )}

        {appMode === 'debug_in_event' && onBackToInteractive && (
          <>
            <div className="w-px h-5 bg-gray-300 dark:bg-gray-500 mx-0.5" />
            <button
              onClick={onBackToInteractive}
              className={btnActive}
              title="Back to interactive mode"
            >
              <MousePointerClick size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
