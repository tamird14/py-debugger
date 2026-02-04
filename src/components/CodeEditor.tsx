import { useRef, useEffect, useState } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

interface CodeEditorProps {
  code: string;
  onChange: (code: string) => void;
  isAnalyzing: boolean;
  isEditable: boolean;
  currentLine?: number;
  lastExecutedLine?: number;
  onAnalyze: () => void;
  onEdit: () => void;
  error?: string;
  output?: string;
}

// Sample code for demo
export const SAMPLE_CODE = `# Bubble Sort Example
arr = [64, 34, 25, 12, 22, 11, 90]
n = len(arr)

for i in range(n):
    for j in range(0, n-i-1):
        if arr[j] > arr[j+1]:
            arr[j], arr[j+1] = arr[j+1], arr[j]

print("Sorted array:", arr)
`;

export const SAMPLE_PREFIX_SUM = `# Prefix Sum Example
nums = [1, 2, 3, 4, 5]
prefix = [0] * len(nums)
total = 0

for i in range(len(nums)):
    total = total + nums[i]
    prefix[i] = total

print("Prefix sums:", prefix)
`;

export const SAMPLE_BINARY_SEARCH = `# Binary Search Example
arr = [2, 3, 4, 10, 40, 50, 60]
target = 10
left = 0
right = len(arr) - 1
mid = 0
found = -1

while left <= right:
    mid = (left + right) // 2
    if arr[mid] == target:
        found = mid
        break
    elif arr[mid] < target:
        left = mid + 1
    else:
        right = mid - 1

print("Found at index:", found)
`;

export function CodeEditor({
  code,
  onChange,
  isAnalyzing,
  isEditable,
  currentLine,
  lastExecutedLine,
  onAnalyze,
  onEdit,
  error,
  output,
}: CodeEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationsRef = useRef<string[]>([]);
  const [showSamples, setShowSamples] = useState(false);

  // Handle editor mount
  const handleEditorDidMount = (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Configure Python language features
    monaco.languages.setLanguageConfiguration('python', {
      comments: {
        lineComment: '#',
      },
      brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')'],
      ],
      autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
      ],
    });
  };

  // Update line decorations when currentLine changes
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;

    const monaco = monacoRef.current;
    const editor = editorRef.current;

    const newDecorations: editor.IModelDeltaDecoration[] = [];

    // Highlight current line (next to execute)
    if (currentLine && currentLine > 0) {
      newDecorations.push({
        range: new monaco.Range(currentLine, 1, currentLine, 1),
        options: {
          isWholeLine: true,
          className: 'current-line-highlight',
          glyphMarginClassName: 'current-line-glyph',
        },
      });
    }

    // Highlight last executed line
    if (lastExecutedLine && lastExecutedLine > 0 && lastExecutedLine !== currentLine) {
      newDecorations.push({
        range: new monaco.Range(lastExecutedLine, 1, lastExecutedLine, 1),
        options: {
          isWholeLine: true,
          className: 'executed-line-highlight',
        },
      });
    }

    // Apply decorations
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);
  }, [currentLine, lastExecutedLine]);

  const loadSample = (sampleCode: string) => {
    onChange(sampleCode);
    setShowSamples(false);
  };

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Editor Header */}
      <div className="flex-shrink-0 bg-gray-800 px-4 py-2 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-300">Python Code</span>
          {!isEditable && (
            <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded">
              Read-only
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowSamples(!showSamples)}
              className="px-3 py-1 text-sm bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
            >
              Samples
            </button>
            {showSamples && (
              <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-10 min-w-[200px]">
                <button
                  onClick={() => loadSample(SAMPLE_CODE)}
                  className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  Bubble Sort
                </button>
                <button
                  onClick={() => loadSample(SAMPLE_PREFIX_SUM)}
                  className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  Prefix Sum
                </button>
                <button
                  onClick={() => loadSample(SAMPLE_BINARY_SEARCH)}
                  className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  Binary Search
                </button>
              </div>
            )}
          </div>
          {isEditable ? (
            <button
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
          ) : (
            <button
              onClick={onEdit}
              className="px-4 py-1 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-500 transition-colors"
            >
              Edit Code
            </button>
          )}
        </div>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          defaultLanguage="python"
          theme="vs-dark"
          value={code}
          onChange={(value) => onChange(value || '')}
          onMount={handleEditorDidMount}
          options={{
            readOnly: !isEditable,
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: 'on',
            glyphMargin: true,
            folding: true,
            lineDecorationsWidth: 10,
            lineNumbersMinChars: 3,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 4,
            insertSpaces: true,
            wordWrap: 'on',
          }}
        />
      </div>

      {/* Error/Output Panel */}
      {(error || output) && (
        <div className="flex-shrink-0 border-t border-gray-700 max-h-32 overflow-auto">
          {error && (
            <div className="px-4 py-2 bg-red-900/30 text-red-400 text-sm font-mono">
              <span className="font-semibold">Error: </span>
              {error}
            </div>
          )}
          {output && !error && (
            <div className="px-4 py-2 bg-gray-800 text-gray-300 text-sm font-mono">
              <span className="font-semibold text-gray-400">Output: </span>
              {output}
            </div>
          )}
        </div>
      )}

      {/* CSS for line highlighting */}
      <style>{`
        .current-line-highlight {
          background-color: rgba(255, 235, 59, 0.2) !important;
          border-left: 3px solid #ffeb3b !important;
        }
        .current-line-glyph {
          background-color: #ffeb3b;
          border-radius: 50%;
          margin-left: 3px;
        }
        .executed-line-highlight {
          background-color: rgba(76, 175, 80, 0.15) !important;
        }
      `}</style>
    </div>
  );
}
