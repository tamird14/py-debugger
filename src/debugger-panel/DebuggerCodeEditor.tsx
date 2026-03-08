import { useEffect, useRef, useState } from 'react';
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
  breakpoints?: Set<number>;
  onBreakpointsChange?: (next: Set<number>) => void;
}

export function DebuggerCodeEditor({
  code,
  onChange,
  highlightedLines,
  breakpoints,
  onBreakpointsChange,
}: DebuggerCodeEditorProps) {
  const { darkMode } = useTheme();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationsRef = useRef<MonacoTypes.editor.IEditorDecorationsCollection | null>(null);
  // Tracks the latest breakpoints inside the mouse-down closure without re-registering it
  const breakpointsRef = useRef<Set<number>>(new Set());
  const [editorReady, setEditorReady] = useState(false);

  useEffect(() => {
    breakpointsRef.current = breakpoints ?? new Set();
  }, [breakpoints]);

  const handleMount = (ed: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = ed;
    monacoRef.current = monaco;

    ed.onMouseDown((e) => {
      const { GUTTER_GLYPH_MARGIN, GUTTER_LINE_NUMBERS } = monaco.editor.MouseTargetType;
      if (e.target.type === GUTTER_GLYPH_MARGIN || e.target.type === GUTTER_LINE_NUMBERS) {
        const line = e.target.position?.lineNumber;
        if (line == null) return;
        const next = new Set(breakpointsRef.current);
        if (next.has(line)) next.delete(line); else next.add(line);
        onBreakpointsChange?.(next);
      }
    });

    decorationsRef.current = ed.createDecorationsCollection([]);
    setEditorReady(true);
  };

  // Re-apply all decorations whenever highlights, breakpoints, or the editor change
  useEffect(() => {
    const ed = editorRef.current;
    const monaco = monacoRef.current;
    if (!ed || !monaco || !editorReady) return;

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

    for (const line of breakpoints ?? []) {
      decorations.push({
        range: new monaco.Range(line, 1, line, 1),
        options: { glyphMarginClassName: 'breakpoint-glyph' },
      });
    }

    decorationsRef.current?.set(decorations);
  }, [highlightedLines, breakpoints, editorReady]);

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
          glyphMargin: true,
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
