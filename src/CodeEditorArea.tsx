import { useRef } from 'react';
import { CodeEditor } from './code-builder/CodeEditor';
import SAMPLE_VISUAL_BUILDER from './code-builder/sample.py?raw';

interface CodeEditorAreaProps {
  code: string;
  onChange: (code: string) => void;
  onAnalyze: () => void;
  onSave: () => void;
  onLoad: (data: { code?: string }) => void;
  isAnalyzing: boolean;
  error?: string;
}

export function CodeEditorArea({
  code,
  onChange,
  onAnalyze,
  onSave,
  onLoad,
  isAnalyzing,
  error,
}: CodeEditorAreaProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        onLoad(data);
      } catch {
        console.error('Failed to parse JSON file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      <div className="flex-shrink-0 bg-gray-100 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700 px-4 py-2 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Visual Builder (Python)
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange(SAMPLE_VISUAL_BUILDER)}
            className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Sample
          </button>
          <button
            type="button"
            onClick={onSave}
            className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Load
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={onAnalyze}
            disabled={isAnalyzing || !code.trim()}
            className={`px-4 py-1 text-sm font-medium rounded transition-colors ${
              isAnalyzing || !code.trim()
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-emerald-600 text-white hover:bg-emerald-500'
            }`}
          >
            {isAnalyzing ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
      </div>

      <CodeEditor code={code} onChange={onChange} error={error} />
    </div>
  );
}
