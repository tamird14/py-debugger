import type { VariableDictionary } from '../types/grid';

interface VariableUploaderProps {
  onLoad: (variables: VariableDictionary) => void;
  hasVariables: boolean;
}

// Sample dictionary - will be replaced with file upload later
const SAMPLE_VARIABLES: VariableDictionary = {
  x: {
    type: 'int',
    value: 42,
  },
  i: {
    type: 'int',
    value: 3,
  },
  j: {
    type: 'int',
    value: 7,
  },
  sum: {
    type: 'int',
    value: 150,
  },
  arr: {
    type: 'arr[int]',
    value: [10, 20, 30, 40, 50],
  },
  nums: {
    type: 'arr[int]',
    value: [1, 2, 3, 4, 5, 6, 7, 8],
  },
  matrix_row: {
    type: 'arr[int]',
    value: [100, 200, 300],
  },
};

export function VariableUploader({ onLoad, hasVariables }: VariableUploaderProps) {
  const handleLoad = () => {
    onLoad(SAMPLE_VARIABLES);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleLoad}
        className={`
          px-3 py-1 rounded text-sm font-medium cursor-pointer transition-colors
          ${hasVariables
            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
            : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
          }
        `}
      >
        {hasVariables ? 'Reload Variables' : 'Load Variables'}
      </button>
      {hasVariables && (
        <span className="text-xs text-emerald-600">Variables loaded</span>
      )}
    </div>
  );
}
