import { useRef, useEffect, useState, useCallback } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type * as MonacoTypes from 'monaco-editor';
import { VISUAL_ELEM_SCHEMA } from '../../api/visualBuilder';
import { useTheme } from '../../contexts/ThemeContext';
import { getVizRanges } from './vizBlockParser';
import sampleCode from './sample.py?raw';

export const COMBINED_SAMPLE = sampleCode;

interface CombinedEditorProps {
  code: string;
  onChange: (code: string) => void;
  isEditable: boolean;
  isAnalyzing: boolean;
  currentStep?: number;
  onAnalyze: () => void;
  onEdit: () => void;
  error?: string;
  output?: string;
}

export function CombinedEditor({
  code,
  onChange,
  isEditable,
  isAnalyzing,
  currentStep,
  onAnalyze,
  onEdit,
  error,
  output,
}: CombinedEditorProps) {
  const { darkMode } = useTheme();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const vizDecorationsRef = useRef<string[]>([]);
  const activeDecorationsRef = useRef<string[]>([]);
  const disposablesRef = useRef<{ dispose(): void }[]>([]);
  const [apiReferenceOpen, setApiReferenceOpen] = useState(false);
  const [editorMountKey, setEditorMountKey] = useState(0);
  const monacoTheme = darkMode ? 'vs-dark' : 'vs';

  // Update viz block decorations whenever code changes
  const updateVizDecorations = useCallback(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const ranges = getVizRanges(code);
    const decorations: editor.IModelDeltaDecoration[] = [];

    for (const r of ranges) {
      for (let line = r.startLine; line <= r.endLine; line++) {
        decorations.push({
          range: new monaco.Range(line, 1, line, 1),
          options: {
            isWholeLine: true,
            className: 'viz-block-line',
          },
        });
      }
    }

    vizDecorationsRef.current = editor.deltaDecorations(vizDecorationsRef.current, decorations);
  }, [code]);

  // Update active step decoration (highlight the # @end line of the current step)
  const updateActiveDecoration = useCallback(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const ranges = getVizRanges(code);
    const decorations: editor.IModelDeltaDecoration[] = [];

    if (currentStep !== undefined && currentStep >= 0 && currentStep < ranges.length) {
      const endLine = ranges[currentStep].endLine;
      decorations.push({
        range: new monaco.Range(endLine, 1, endLine, 1),
        options: {
          isWholeLine: true,
          className: 'active-viz-end',
        },
      });
    }

    activeDecorationsRef.current = editor.deltaDecorations(activeDecorationsRef.current, decorations);
  }, [code, currentStep]);

  useEffect(() => {
    updateVizDecorations();
  }, [updateVizDecorations, editorMountKey]);

  useEffect(() => {
    updateActiveDecoration();
  }, [updateActiveDecoration, editorMountKey]);

  const handleEditorDidMount = (editorInstance: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editorInstance;
    monacoRef.current = monaco;
    vizDecorationsRef.current = [];
    activeDecorationsRef.current = [];
    setEditorMountKey((k) => k + 1);

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

    // Register folding range provider for viz blocks
    const foldingDisposable = monaco.languages.registerFoldingRangeProvider('python', {
      provideFoldingRanges: (model: MonacoTypes.editor.ITextModel) => {
        return getVizRanges(model.getValue()).map((r) => ({
          start: r.startLine,
          end: r.endLine,
          kind: monaco.languages.FoldingRangeKind.Region,
        }));
      },
    });
    disposablesRef.current.push(foldingDisposable);

    // Completion provider
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
    disposablesRef.current.push(completionDisposable);

    // Hover provider
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
    disposablesRef.current.push(hoverDisposable);
  };

  useEffect(() => {
    return () => {
      disposablesRef.current.forEach((d) => d.dispose());
      disposablesRef.current = [];
    };
  }, []);

  const foldAllViz = () => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const ranges = getVizRanges(code);
    for (const r of ranges) {
      editor.setSelection(new monaco.Range(r.startLine, 1, r.startLine, 1));
      editor.trigger('fold', 'editor.fold', {});
    }
  };

  const unfoldAllViz = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.trigger('unfold', 'editor.unfoldAll', {});
  };

  const vizCount = getVizRanges(code).length;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Toolbar */}
      <div className="flex-shrink-0 bg-gray-100 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Python Code</span>
          {!isEditable && (
            <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded">
              Read-only
            </span>
          )}
          {vizCount > 0 && (
            <span className="text-xs px-2 py-0.5 bg-indigo-500/20 text-indigo-400 rounded">
              {vizCount} viz {vizCount === 1 ? 'block' : 'blocks'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {vizCount > 0 && (
            <>
              <button
                type="button"
                onClick={foldAllViz}
                title="Fold all viz blocks"
                className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Fold viz
              </button>
              <button
                type="button"
                onClick={unfoldAllViz}
                title="Unfold all viz blocks"
                className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Unfold viz
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setApiReferenceOpen((o) => !o)}
            className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            {apiReferenceOpen ? 'Hide' : 'Show'} API
          </button>
          {isEditable ? (
            <button
              type="button"
              onClick={onAnalyze}
              disabled={isAnalyzing || !code.trim()}
              className={`px-4 py-1 text-sm font-medium rounded transition-colors ${
                isAnalyzing || !code.trim()
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-500'
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
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          defaultLanguage="python"
          theme={monacoTheme}
          value={code}
          onChange={(value) => onChange(value || '')}
          onMount={handleEditorDidMount}
          options={{
            readOnly: !isEditable,
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: 'on',
            glyphMargin: false,
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

      {/* API Reference */}
      {apiReferenceOpen && (
        <div className="flex-shrink-0 border-t border-gray-300 dark:border-gray-700 max-h-48 overflow-auto bg-gray-50 dark:bg-gray-800">
          <div className="px-3 py-2 border-b border-gray-300 dark:border-gray-600">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">API Reference</span>
          </div>
          <div className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 space-y-3">
            {VISUAL_ELEM_SCHEMA.map((cls) => (
              <div key={cls.className} className="border-b border-gray-300 dark:border-gray-600 pb-2 last:border-0">
                <div className="font-mono font-medium text-gray-900 dark:text-gray-200">
                  {cls.className}({cls.constructorParams})
                </div>
                <div className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">{cls.docstring}</div>
                <div className="mt-1.5 space-y-0.5">
                  {cls.properties.map((p) => (
                    <div key={p.name} className="font-mono text-xs flex gap-2">
                      <span className="text-amber-600 dark:text-amber-300">{p.name}</span>
                      <span className="text-gray-400 dark:text-gray-500">: {p.type}</span>
                      <span className="text-gray-500 dark:text-gray-400">— {p.description}</span>
                    </div>
                  ))}
                  {cls.methods?.map((m) => (
                    <div key={m.name} className="font-mono text-xs flex gap-2 mt-0.5">
                      <span className="text-cyan-600 dark:text-cyan-300">{m.name}</span>
                      <span className="text-gray-400 dark:text-gray-500">{m.signature}</span>
                      <span className="text-gray-500 dark:text-gray-400">— {m.docstring}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error / Output */}
      {(error || output) && (
        <div className="flex-shrink-0 border-t border-gray-300 dark:border-gray-700 max-h-32 overflow-auto">
          {error && (
            <div className="px-4 py-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm font-mono">
              <span className="font-semibold">Error: </span>
              {error}
            </div>
          )}
          {output && !error && (
            <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-mono">
              <span className="font-semibold text-gray-500 dark:text-gray-400">Output: </span>
              {output}
            </div>
          )}
        </div>
      )}

      <style>{`
        .viz-block-line {
          background-color: rgba(99, 102, 241, 0.07) !important;
          border-left: 2px solid rgba(99, 102, 241, 0.3) !important;
        }
        .active-viz-end {
          background-color: rgba(99, 102, 241, 0.2) !important;
          border-left: 3px solid #6366f1 !important;
        }
      `}</style>
    </div>
  );
}
