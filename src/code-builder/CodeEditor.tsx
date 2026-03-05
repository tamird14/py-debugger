import { useEffect, useRef } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type * as MonacoTypes from 'monaco-editor';
import { VISUAL_ELEM_SCHEMA } from '../api/visualBuilder';
import { useTheme } from '../contexts/ThemeContext';

interface SaveData {
  mode?: string;
  code?: string;
}

interface CodeEditorProps {
  code: string;
  onChange: (code: string) => void;
  onAnalyze: () => void;
  onSave: () => void;
  onLoad: (data: SaveData) => void;
  isAnalyzing: boolean;
  error?: string;
  mode: 'simple' | 'discrete';
  onModeChange: (mode: 'simple' | 'discrete') => void;
}

export const SAMPLE_VISUAL_BUILDER = `# Visual Builder - create elements to show on the grid
# Click "Analyze" to add them to the visual panel.

panel = Panel("Main")
panel.position = (2, 2)
panel.width = 18
panel.height = 10

# Shapes
r = Rect((1, 1))
r.width = 6
r.height = 2
r.color = (34, 197, 94)
panel.add(r)

c = Circle((1, 8))
c.width = 2
c.height = 2
c.color = (59, 130, 246)
panel.add(c)

a = Arrow((1, 12))
a.orientation = "right"
a.color = (239, 68, 68)
panel.add(a)

# Labels
title = Label("Hello Visual Panel")
title.position = (0, 1)
title.width = 16
title.height = 1
title.font_size = 14
panel.add(title)

# Value arrays (static)
nums = Array()
nums.position = (4, 1)
nums.direction = "right"
nums.length = 7
nums.show_index = True
nums[0] = 3
nums[1] = 1
nums[2] = 4
nums[3] = 1
nums[4] = 5
nums[5] = 9
nums[6] = 2
panel.add(nums)

# 2D array (static)
mat = Array2D()
mat.position = (6, 1)
mat.set_dims(3, 4)
panel.add(mat)
`;

export function CodeEditor({
  code,
  onChange,
  onAnalyze,
  onSave,
  onLoad,
  isAnalyzing,
  error,
  mode,
  onModeChange,
}: CodeEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLoadClick = () => {
    fileInputRef.current?.click();
  };

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

  const { darkMode } = useTheme();
  const monacoTheme = darkMode ? 'vs-dark' : 'vs';

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const disposablesRef = useRef<{ dispose(): void }[]>([]);

  const handleEditorDidMount = (ed: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = ed;
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

    const completionDisposable = monaco.languages.registerCompletionItemProvider('python', {
      triggerCharacters: ['.'],
      provideCompletionItems: (model: MonacoTypes.editor.ITextModel, position: MonacoTypes.Position) => {
        const line = model.getLineContent(position.lineNumber);
        const before = line.slice(0, position.column - 1);
        const word = model.getWordUntilPosition(position);
        const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);

        const items: MonacoTypes.languages.CompletionItem[] = [];

        // After a dot: suggest all known properties/methods (simple, schema-based)
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
          return { suggestions: items };
        }

        // New word: suggest class names
        const partial = word.word;
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
        return { suggestions: items };
      },
    });
    disposablesRef.current.push(completionDisposable);

    const hoverDisposable = monaco.languages.registerHoverProvider('python', {
      provideHover: (model: MonacoTypes.editor.ITextModel, position: MonacoTypes.Position) => {
        const wordAt = model.getWordAtPosition(position);
        if (!wordAt) return null;
        const name = wordAt.word;

        for (const cls of VISUAL_ELEM_SCHEMA) {
          if (cls.className === name) {
            const content = [
              `**${cls.className}**(${cls.constructorParams})`,
              cls.docstring,
              ...cls.properties.map((p) => `- \`${p.name}\`: ${p.type} — ${p.description}`),
              ...(cls.methods ?? []).map((m) => `- \`${m.signature}\` — ${m.docstring}`),
            ].join('\n\n');
            return {
              contents: [{ value: content }],
              range: new monaco.Range(position.lineNumber, wordAt.startColumn, position.lineNumber, wordAt.endColumn),
            };
          }
          for (const p of cls.properties) {
            if (p.name === name) {
              return {
                contents: [{ value: `\`${p.name}\`: ${p.type}\n\n${p.description}` }],
                range: new monaco.Range(position.lineNumber, wordAt.startColumn, position.lineNumber, wordAt.endColumn),
              };
            }
          }
          for (const m of cls.methods ?? []) {
            if (m.name === name) {
              return {
                contents: [{ value: `\`${m.signature}\`\n\n${m.docstring}` }],
                range: new monaco.Range(position.lineNumber, wordAt.startColumn, position.lineNumber, wordAt.endColumn),
              };
            }
          }
        }
        return null;
      },
    });
    disposablesRef.current.push(hoverDisposable);
  };

  useEffect(() => {
    return () => {
      disposablesRef.current.forEach((d) => d.dispose());
      disposablesRef.current = [];
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      <div className="flex-shrink-0 bg-gray-100 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700 px-4 py-2 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Visual Builder (Python)</span>
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
            onClick={handleLoadClick}
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
          <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
            <span>Mode</span>
            <select
              value={mode}
              onChange={(e) => onModeChange(e.target.value === 'discrete' ? 'discrete' : 'simple')}
              className="px-2 py-1 text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded"
            >
              <option value="simple">Simple</option>
              <option value="discrete">Discrete</option>
            </select>
          </label>
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

      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          defaultLanguage="python"
          theme={monacoTheme}
          value={code}
          onChange={(value) => onChange(value || '')}
          onMount={handleEditorDidMount}
          options={{
            readOnly: false,
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: 'on',
            glyphMargin: false,
            folding: true,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 4,
            insertSpaces: true,
            wordWrap: 'on',
          }}
        />
      </div>

      {error && (
        <div className="flex-shrink-0 border-t border-gray-300 dark:border-gray-700 max-h-40 overflow-auto">
          <div className="px-4 py-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm font-mono">
            <span className="font-semibold">Error: </span>
            {error}
          </div>
        </div>
      )}

    </div>
  );
}

