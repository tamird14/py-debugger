import { useRef, useEffect, useState } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type * as MonacoTypes from 'monaco-editor';
import { VISUAL_ELEM_SCHEMA } from '../types/visualBuilder';

type CodePanelTab = 'code' | 'visual-builder';

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
  // Visual Builder tab
  visualBuilderCode?: string;
  onVisualBuilderCodeChange?: (code: string) => void;
  onAnalyzeVisualBuilder?: () => void;
  isAnalyzingVisualBuilder?: boolean;
  visualBuilderError?: string;
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

const SAMPLE_VISUAL_BUILDER = `# Visual Builder - create elements to show on the grid
# Click "Analyze" to add them to the visual panel.

panel = Panel("Main")
panel.position = (2, 2)
panel.width = 10
panel.height = 8

r = Rect((0, 0))
r.width = 2
r.height = 1
r.color = (34, 197, 94)
panel.add(r)

l = Label("i = {i}")
l.position = (1, 0)
panel.add(l)

v = Var("i")
v.position = (2, 0)
panel.add(v)

# Array: show a list variable (e.g. "arr") — run main Code "Analyze" first
arr_viz = Array("arr")
arr_viz.position = (5, 2)
arr_viz.direction = "right"
arr_viz.length = 7
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
  visualBuilderCode = '',
  onVisualBuilderCodeChange,
  onAnalyzeVisualBuilder,
  isAnalyzingVisualBuilder = false,
  visualBuilderError,
}: CodeEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const visualBuilderEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const visualBuilderMonacoRef = useRef<Monaco | null>(null);
  const decorationsRef = useRef<string[]>([]);
  const [showSamples, setShowSamples] = useState(false);
  const [activeTab, setActiveTab] = useState<CodePanelTab>('code');
  const [apiReferenceOpen, setApiReferenceOpen] = useState(true);

  // Handle main code editor mount
  const handleEditorDidMount = (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    monaco.languages.setLanguageConfiguration('python', {
      comments: { lineComment: '#' },
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

  // Visual Builder Monaco intellisense: completion + hover (dispose on unmount)
  const vbDisposablesRef = useRef<{ dispose(): void }[]>([]);

  const handleVisualBuilderEditorDidMount = (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    visualBuilderEditorRef.current = editor;
    visualBuilderMonacoRef.current = monaco;

    if (!monacoRef.current) {
      monaco.languages.setLanguageConfiguration('python', {
        comments: { lineComment: '#' },
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
    }

    // Completion: class names and properties/methods from VISUAL_ELEM_SCHEMA
    const completionDisposable = monaco.languages.registerCompletionItemProvider('python', {
      triggerCharacters: ['.'],
      provideCompletionItems: (
        model: MonacoTypes.editor.ITextModel,
        position: MonacoTypes.Position
      ) => {
        const line = model.getLineContent(position.lineNumber);
        const before = line.slice(0, position.column - 1);
        const word = model.getWordUntilPosition(position);
        const range = new monaco.Range(
          position.lineNumber,
          word.startColumn,
          position.lineNumber,
          word.endColumn
        );

        const items: MonacoTypes.languages.CompletionItem[] = [];

        // After a dot: suggest properties/methods for known classes
        const afterDot = before.match(/\.\s*(\w*)$/);
        if (afterDot) {
          const prefix = afterDot[1].toLowerCase();
          for (const cls of VISUAL_ELEM_SCHEMA) {
            for (const p of cls.properties) {
              if (!prefix || p.name.toLowerCase().startsWith(prefix)) {
                items.push({
                  label: p.name,
                  kind: monaco.languages.CompletionItemKind.Property,
                  detail: p.type,
                  documentation: p.description,
                  insertText: p.name,
                  range,
                });
              }
            }
            for (const m of cls.methods ?? []) {
              if (!prefix || m.name.toLowerCase().startsWith(prefix)) {
                items.push({
                  label: m.name,
                  kind: monaco.languages.CompletionItemKind.Method,
                  detail: m.signature,
                  documentation: m.docstring,
                  insertText: m.name,
                  range,
                });
              }
            }
          }
          if (items.length > 0) return { suggestions: items };
        }

        // Suggest class names
        const linePrefix = before.replace(/\s*$/, '');
        const isNewWord = /(?:^|[^\w])$/.test(linePrefix) || linePrefix === '';
        const partial = word.word;
        if (isNewWord || partial.length > 0) {
          for (const cls of VISUAL_ELEM_SCHEMA) {
            if (partial && !cls.className.toLowerCase().startsWith(partial.toLowerCase())) continue;
            items.push({
              label: cls.className,
              kind: monaco.languages.CompletionItemKind.Class,
              detail: `(${cls.constructorParams})`,
              documentation: cls.docstring,
              insertText: cls.className,
              range,
            });
          }
        }
        return items.length > 0 ? { suggestions: items } : { suggestions: [] };
      },
    });
    vbDisposablesRef.current.push(completionDisposable);

    // Hover: docstrings for class and property names
    const hoverDisposable = monaco.languages.registerHoverProvider('python', {
      provideHover: (
        model: MonacoTypes.editor.ITextModel,
        position: MonacoTypes.Position
      ) => {
        const word = model.getWordAtPosition(position);
        if (!word) return null;
        const name = word.word;

        for (const cls of VISUAL_ELEM_SCHEMA) {
          if (cls.className === name) {
            const content = [
              `**${cls.className}**(${cls.constructorParams})`,
              cls.docstring,
              ...cls.properties.map((p) => `- \`${p.name}\`: ${p.type} — ${p.description}`),
              ...(cls.methods ?? []).map((m) => `- \`${m.signature}\` — ${m.docstring}`),
            ].join('\n\n');
            return { contents: [{ value: content }], range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn) };
          }
          for (const p of cls.properties) {
            if (p.name === name) {
              const content = `\`${p.name}\`: ${p.type}\n\n${p.description}`;
              return { contents: [{ value: content }], range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn) };
            }
          }
          for (const m of cls.methods ?? []) {
            if (m.name === name) {
              const content = `\`${m.signature}\`\n\n${m.docstring}`;
              return { contents: [{ value: content }], range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn) };
            }
          }
        }
        return null;
      },
    });
    vbDisposablesRef.current.push(hoverDisposable);
  };

  useEffect(() => {
    return () => {
      vbDisposablesRef.current.forEach((d) => d.dispose());
      vbDisposablesRef.current = [];
    };
  }, []);

  // Update line decorations when currentLine changes (code tab only)
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;

    const monaco = monacoRef.current;
    const editor = editorRef.current;

    const newDecorations: editor.IModelDeltaDecoration[] = [];

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

    if (lastExecutedLine && lastExecutedLine > 0 && lastExecutedLine !== currentLine) {
      newDecorations.push({
        range: new monaco.Range(lastExecutedLine, 1, lastExecutedLine, 1),
        options: {
          isWholeLine: true,
          className: 'executed-line-highlight',
        },
      });
    }

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);
  }, [currentLine, lastExecutedLine]);

  const loadSample = (sampleCode: string) => {
    onChange(sampleCode);
    setShowSamples(false);
  };

  const loadVisualBuilderSample = () => {
    onVisualBuilderCodeChange?.(SAMPLE_VISUAL_BUILDER);
  };

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Tab bar + Header */}
      <div className="flex-shrink-0 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center border-b border-gray-700">
          <button
            type="button"
            onClick={() => setActiveTab('code')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'code'
                ? 'bg-gray-700 text-white border-b-2 border-emerald-500'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Code
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('visual-builder')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'visual-builder'
                ? 'bg-gray-700 text-white border-b-2 border-emerald-500'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            Visual Builder
          </button>
        </div>
        <div className="px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-300">
              {activeTab === 'code' ? 'Python Code' : 'Visual Builder (Python)'}
            </span>
            {activeTab === 'code' && !isEditable && (
              <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded">
                Read-only
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'code' && (
              <>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowSamples(!showSamples)}
                    className="px-3 py-1 text-sm bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
                  >
                    Samples
                  </button>
                  {showSamples && (
                    <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-10 min-w-[200px]">
                      <button
                        type="button"
                        onClick={() => loadSample(SAMPLE_CODE)}
                        className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                      >
                        Bubble Sort
                      </button>
                      <button
                        type="button"
                        onClick={() => loadSample(SAMPLE_PREFIX_SUM)}
                        className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                      >
                        Prefix Sum
                      </button>
                      <button
                        type="button"
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
                ) : (
                  <button
                    type="button"
                    onClick={onEdit}
                    className="px-4 py-1 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-500 transition-colors"
                  >
                    Edit Code
                  </button>
                )}
              </>
            )}
            {activeTab === 'visual-builder' && (
              <>
                <button
                  type="button"
                  onClick={loadVisualBuilderSample}
                  className="px-3 py-1 text-sm bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
                >
                  Sample
                </button>
                <button
                  type="button"
                  onClick={() => setApiReferenceOpen((o) => !o)}
                  className="px-3 py-1 text-sm bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
                >
                  {apiReferenceOpen ? 'Hide' : 'Show'} API Reference
                </button>
                <button
                  type="button"
                  onClick={onAnalyzeVisualBuilder}
                  disabled={isAnalyzingVisualBuilder || !(visualBuilderCode?.trim())}
                  className={`px-4 py-1 text-sm font-medium rounded transition-colors ${
                    isAnalyzingVisualBuilder || !(visualBuilderCode?.trim())
                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      : 'bg-emerald-600 text-white hover:bg-emerald-500'
                  }`}
                >
                  {isAnalyzingVisualBuilder ? 'Analyzing...' : 'Analyze'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Code tab content */}
      {activeTab === 'code' && (
        <>
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
        </>
      )}

      {/* Visual Builder tab content */}
      {activeTab === 'visual-builder' && (
        <>
          <div className="flex-1 overflow-hidden">
            <Editor
              height="100%"
              defaultLanguage="python"
              theme="vs-dark"
              value={visualBuilderCode}
              onChange={(value) => onVisualBuilderCodeChange?.(value || '')}
              onMount={handleVisualBuilderEditorDidMount}
              options={{
                readOnly: false,
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
          {apiReferenceOpen && (
            <div className="flex-shrink-0 border-t border-gray-700 max-h-48 overflow-auto bg-gray-800">
              <div className="px-3 py-2 border-b border-gray-600 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400 uppercase">API Reference</span>
              </div>
              <div className="px-3 py-2 text-sm text-gray-300 space-y-3">
                {VISUAL_ELEM_SCHEMA.map((cls) => (
                  <div key={cls.className} className="border-b border-gray-600 pb-2 last:border-0">
                    <div className="font-mono font-medium text-gray-200">
                      {cls.className}({cls.constructorParams})
                    </div>
                    <div className="text-gray-400 text-xs mt-0.5">{cls.docstring}</div>
                    <div className="mt-1.5 space-y-0.5">
                      {cls.properties.map((p) => (
                        <div key={p.name} className="font-mono text-xs flex gap-2">
                          <span className="text-amber-300">{p.name}</span>
                          <span className="text-gray-500">: {p.type}</span>
                          <span className="text-gray-400">— {p.description}</span>
                        </div>
                      ))}
                      {cls.methods?.map((m) => (
                        <div key={m.name} className="font-mono text-xs flex gap-2 mt-0.5">
                          <span className="text-cyan-300">{m.name}</span>
                          <span className="text-gray-500">{m.signature}</span>
                          <span className="text-gray-400">— {m.docstring}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {visualBuilderError && (
            <div className="flex-shrink-0 border-t border-gray-700 px-4 py-2 bg-red-900/30 text-red-400 text-sm font-mono">
              <span className="font-semibold">Error: </span>
              {visualBuilderError}
            </div>
          )}
        </>
      )}

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
