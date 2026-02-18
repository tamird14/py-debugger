interface TimelineControlsProps {
  currentStep: number;
  stepCount: number;
  onPrevStep: () => void;
  onNextStep: () => void;
  onGoToStep: (step: number) => void;
}

export function TimelineControls({
  currentStep,
  stepCount,
  onPrevStep,
  onNextStep,
  onGoToStep,
}: TimelineControlsProps) {
  if (stepCount === 0) {
    return null;
  }

  const canGoPrev = currentStep > 0;
  const canGoNext = currentStep < stepCount - 1;
  const canGoFirst = currentStep > 0;
  const canGoLast = currentStep < stepCount - 1;

  return (
    <div className="flex items-center gap-3 px-3 py-1 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
      {/* Step indicator */}
      <span className="text-sm text-gray-600 dark:text-gray-300 font-medium min-w-[80px]">
        Step {currentStep + 1} / {stepCount}
      </span>

      {/* Navigation buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onGoToStep(0)}
          disabled={!canGoFirst}
          className={`
            px-2 py-1 rounded text-sm font-medium transition-colors
            ${canGoFirst
              ? 'bg-white dark:bg-gray-600 hover:bg-gray-100 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-500'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-600 cursor-not-allowed'
            }
          `}
          title="First step"
        >
          {'<<'}
        </button>
        <button
          onClick={onPrevStep}
          disabled={!canGoPrev}
          className={`
            px-2 py-1 rounded text-sm font-medium transition-colors
            ${canGoPrev
              ? 'bg-white dark:bg-gray-600 hover:bg-gray-100 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-500'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-600 cursor-not-allowed'
            }
          `}
          title="Previous step"
        >
          ←
        </button>
        <button
          onClick={onNextStep}
          disabled={!canGoNext}
          className={`
            px-2 py-1 rounded text-sm font-medium transition-colors
            ${canGoNext
              ? 'bg-white dark:bg-gray-600 hover:bg-gray-100 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-500'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-600 cursor-not-allowed'
            }
          `}
          title="Next step"
        >
          →
        </button>
        <button
          onClick={() => onGoToStep(stepCount - 1)}
          disabled={!canGoLast}
          className={`
            px-2 py-1 rounded text-sm font-medium transition-colors
            ${canGoLast
              ? 'bg-white dark:bg-gray-600 hover:bg-gray-100 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-500'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-600 cursor-not-allowed'
            }
          `}
          title="Last step"
        >
          {'>>'}
        </button>
      </div>

      {/* Slider for direct step selection */}
      {stepCount > 1 && (
        <input
          type="range"
          min={0}
          max={stepCount - 1}
          value={currentStep}
          onChange={(e) => onGoToStep(parseInt(e.target.value, 10))}
          className="w-24 h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
          title={`Go to step ${currentStep + 1}`}
        />
      )}
    </div>
  );
}
