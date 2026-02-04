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

  return (
    <div className="flex items-center gap-3 px-3 py-1 bg-gray-50 rounded-lg border border-gray-200">
      {/* Step indicator */}
      <span className="text-sm text-gray-600 font-medium min-w-[80px]">
        Step {currentStep + 1} / {stepCount}
      </span>

      {/* Navigation buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={onPrevStep}
          disabled={!canGoPrev}
          className={`
            px-2 py-1 rounded text-sm font-medium transition-colors
            ${canGoPrev
              ? 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-300'
              : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
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
              ? 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-300'
              : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
            }
          `}
          title="Next step"
        >
          →
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
          className="w-24 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
          title={`Go to step ${currentStep + 1}`}
        />
      )}
    </div>
  );
}
