import type { Timeline } from '../types/grid';

interface TimelineLoaderProps {
  onLoad: (timeline: Timeline) => void;
  hasTimeline: boolean;
}

// Sample timeline - demonstrates variable changes over time
const SAMPLE_TIMELINE: Timeline = [
  {
    i: { type: 'int', value: 0 },
    j: { type: 'int', value: 4 },
    sum: { type: 'int', value: 0 },
    arr: { type: 'arr[int]', value: [64, 34, 25, 12, 22] },
  },
  {
    i: { type: 'int', value: 1 },
    j: { type: 'int', value: 3 },
    sum: { type: 'int', value: 64 },
    arr: { type: 'arr[int]', value: [34, 64, 25, 12, 22] },
  },
  {
    i: { type: 'int', value: 2 },
    j: { type: 'int', value: 2 },
    sum: { type: 'int', value: 98 },
    arr: { type: 'arr[int]', value: [25, 34, 64, 12, 22] },
  },
  {
    i: { type: 'int', value: 3 },
    j: { type: 'int', value: 1 },
    sum: { type: 'int', value: 123 },
    arr: { type: 'arr[int]', value: [12, 25, 34, 64, 22] },
  },
  {
    i: { type: 'int', value: 4 },
    j: { type: 'int', value: 0 },
    sum: { type: 'int', value: 135 },
    arr: { type: 'arr[int]', value: [12, 22, 25, 34, 64] },
  },
];

export function TimelineLoader({ onLoad, hasTimeline }: TimelineLoaderProps) {
  const handleLoad = () => {
    onLoad(SAMPLE_TIMELINE);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleLoad}
        className={`
          px-3 py-1 rounded text-sm font-medium cursor-pointer transition-colors
          ${hasTimeline
            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
            : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
          }
        `}
      >
        {hasTimeline ? 'Reload Timeline' : 'Load Timeline'}
      </button>
      {hasTimeline && (
        <span className="text-xs text-emerald-600">Timeline loaded</span>
      )}
    </div>
  );
}
