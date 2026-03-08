import { useEffect, useRef } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type * as MonacoTypes from 'monaco-editor';
import { useTheme } from '../contexts/ThemeContext';

export interface HighlightedLines {
  prev: number | null;
  next: number | null;
}

interface DebuggerCodeEditorProps {
  code: string;
  onChange: (code: string) => void;
  highlightedLines?: HighlightedLines;
}

export function DebuggerCodeEditor({
  code,
  onChange,
  highlightedLines,
}: DebuggerCodeEditorProps) {
  const { darkMode } = useTheme();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationIdsRef = useRef<string[]>([]);

  const handleMount = (ed: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = ed;
    monacoRef.current = monaco;
  };

  useEffect(() => {
    const ed = editorRef.current;
    const monaco = monacoRef.current;
    if (!ed || !monaco) return;

    const decorations: MonacoTypes.editor.IModelDeltaDecoration[] = [];

    if (highlightedLines?.prev != null) {
      decorations.push({
        range: new monaco.Range(highlightedLines.prev, 1, highlightedLines.prev, 1),
        options: {
          isWholeLine: true,
          className: 'debugger-prev-line',
          linesDecorationsClassName: 'debugger-prev-glyph',
        },
      });
    }

    if (highlightedLines?.next != null) {
      decorations.push({
        range: new monaco.Range(highlightedLines.next, 1, highlightedLines.next, 1),
        options: {
          isWholeLine: true,
          className: 'debugger-next-line',
          linesDecorationsClassName: 'debugger-next-glyph',
        },
      });
    }

    decorationIdsRef.current = ed.deltaDecorations(decorationIdsRef.current, decorations);
  }, [highlightedLines]);

  return (
    <div className="h-full">
      <Editor
        height="100%"
        defaultLanguage="python"
        theme={darkMode ? 'vs-dark' : 'vs'}
        value={code}
        onChange={(v) => onChange(v ?? '')}
        onMount={handleMount}
        options={{
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
  );
}
