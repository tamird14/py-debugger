import { useEffect, useRef } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type * as MonacoTypes from 'monaco-editor';
import { VISUAL_ELEM_SCHEMA } from '../api/visualBuilder';
import { useTheme } from '../contexts/ThemeContext';

interface CodeEditorProps {
  code: string;
  onChange: (code: string) => void;
  error?: string;
  readOnly?: boolean;
}

export function CodeEditor({
  code,
  onChange,
  error,
  readOnly = false,
}: CodeEditorProps) {


  const { darkMode } = useTheme();
  const monacoTheme = darkMode ? 'vs-dark' : 'vs';

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const disposablesRef = useRef<{ dispose(): void }[]>([]);

  // Sync external code changes to the editor without using the controlled `value`
  // prop (which calls setValue on every render and can reset cursor/selection).
  useEffect(() => {
    const ed = editorRef.current;
    if (ed && ed.getValue() !== code) {
      ed.setValue(code);
    }
  }, [code]);

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly });
  }, [readOnly]);

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
          if (partial && !cls.objName.toLowerCase().startsWith(partial.toLowerCase())) continue;
          items.push({
            label: cls.objName,
            kind: monaco.languages.CompletionItemKind.Class,
            detail: `(${cls.properties.filter(p => p.default !== undefined).map(p => `${p.name}=${p.default}`).join(', ')})`,
            documentation: cls.docstring,
            insertText: cls.objName,
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
          if (cls.objName === name) {
            const content = [
              `**${cls.objName}**`,
              cls.docstring,
              ...cls.properties.map((p) => `- \`${p.name}\`: ${p.type}${p.default !== undefined ? ` = ${p.default}` : ''} — ${p.description}`),
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
                contents: [{ value: `\`${p.name}\`: ${p.type}${p.default !== undefined ? ` = ${p.default}` : ''}\n\n${p.description}` }],
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

      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          defaultLanguage="python"
          theme={monacoTheme}
          defaultValue={code}
          onChange={(value) => onChange(value || '')}
          onMount={handleEditorDidMount}
          options={{
            readOnly,
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

