import { useState, useEffect, useMemo, useCallback } from 'react';

interface TimelineControlsProps {
  currentStep: number;
  stepCount: number;
  onGoToStep: (step: number) => void;
  getStepLine: (step: number) => number | null;
  breakpoints: Set<number>;
}

export function TimelineControls({
  currentStep,
  stepCount,
  onGoToStep,
  getStepLine,
  breakpoints,
}: TimelineControlsProps) {
  const [inputValue, setInputValue] = useState(String(currentStep));

  useEffect(() => {
    setInputValue(String(currentStep));
  }, [currentStep]);

  const onPrevStep = useCallback(() => onGoToStep(currentStep - 1), [currentStep, onGoToStep]);
  const onNextStep = useCallback(() => onGoToStep(currentStep + 1), [currentStep, onGoToStep]);

  const goToNextBreakpoint = useCallback(() => {
    const max = stepCount - 1;
    for (let t = currentStep + 1; t <= max; t++) {
      const line = getStepLine(t);
      if (line != null && breakpoints.has(line)) { onGoToStep(t); return; }
    }
  }, [currentStep, stepCount, breakpoints, getStepLine, onGoToStep]);

  const goToPrevBreakpoint = useCallback(() => {
    for (let t = currentStep - 1; t >= 0; t--) {
      const line = getStepLine(t);
      if (line != null && breakpoints.has(line)) { onGoToStep(t); return; }
    }
  }, [currentStep, breakpoints, getStepLine, onGoToStep]);

  const hasNextBreakpoint = useMemo(() => {
    const max = stepCount - 1;
    for (let t = currentStep + 1; t <= max; t++) {
      const line = getStepLine(t);
      if (line != null && breakpoints.has(line)) return true;
    }
    return false;
  }, [currentStep, stepCount, breakpoints, getStepLine]);

  const hasPrevBreakpoint = useMemo(() => {
    for (let t = currentStep - 1; t >= 0; t--) {
      const line = getStepLine(t);
      if (line != null && breakpoints.has(line)) return true;
    }
    return false;
  }, [currentStep, breakpoints, getStepLine]);

  if (stepCount === 0) return null;

  const maxStep = stepCount - 1;
  const canGoPrev = currentStep > 0;
  const canGoNext = currentStep < maxStep;

  const btnBase =
    'px-2 py-1 rounded text-sm font-medium transition-colors border';
  const btnActive =
    `${btnBase} bg-white dark:bg-gray-600 hover:bg-gray-100 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-500`;
  const btnDisabled =
    `${btnBase} bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-600 cursor-not-allowed`;
  const btnBreakpoint =
    `${btnBase} bg-white dark:bg-gray-600 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 dark:text-red-400 border-red-300 dark:border-red-700`;
  const btnBreakpointDisabled =
    `${btnBase} bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-600 cursor-not-allowed`;

  const commitInput = () => {
    const val = parseInt(inputValue, 10);
    if (!isNaN(val) && val >= 0 && val <= maxStep) {
      onGoToStep(val);
    } else {
      setInputValue(String(currentStep));
    }
  };

  return (
    <div className="flex items-center gap-1 px-3 py-1 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
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

      <button
        onClick={goToPrevBreakpoint}
        disabled={!hasPrevBreakpoint}
        className={hasPrevBreakpoint ? btnBreakpoint : btnBreakpointDisabled}
        title="Previous breakpoint"
      >
        ●←
      </button>

      {/* Editable step input */}
      <input
        type="number"
        min={0}
        max={maxStep}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={commitInput}
        onKeyDown={(e) => e.key === 'Enter' && commitInput()}
        className="w-14 text-center text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-500 rounded px-1 py-0.5 text-gray-700 dark:text-gray-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        title={`Step (0 – ${maxStep})`}
      />
      <span className="text-xs text-gray-500 dark:text-gray-400">/ {maxStep}</span>

      <button
        onClick={goToNextBreakpoint}
        disabled={!hasNextBreakpoint}
        className={hasNextBreakpoint ? btnBreakpoint : btnBreakpointDisabled}
        title="Next breakpoint"
      >
        →●
      </button>

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
    </div>
  );
}
