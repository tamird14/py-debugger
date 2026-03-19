import { useEffect, useRef, useState } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type * as MonacoTypes from 'monaco-editor';
import { useTheme } from '../../contexts/ThemeContext';

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
  readOnly?: boolean;
}

export function DebuggerCodeEditor({
  code,
  onChange,
  highlightedLines,
  breakpoints,
  onBreakpointsChange,
  readOnly = false,
}: DebuggerCodeEditorProps) {
  const { darkMode } = useTheme();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationsRef = useRef<MonacoTypes.editor.IEditorDecorationsCollection | null>(null);
  // Tracks the latest breakpoints inside the mouse-down closure without re-registering it
  const breakpointsRef = useRef<Set<number>>(new Set());
  const onBreakpointsChangeRef = useRef(onBreakpointsChange);
  const isProgrammaticChange = useRef(false);
  const [editorReady, setEditorReady] = useState(false);

  useEffect(() => {
    breakpointsRef.current = breakpoints ?? new Set();
  }, [breakpoints]);

  useEffect(() => {
    onBreakpointsChangeRef.current = onBreakpointsChange;
  }, [onBreakpointsChange]);

  // Sync external code changes to the editor without using the controlled `value`
  // prop (which calls setValue on every render and can reset cursor/selection).
  useEffect(() => {
    const ed = editorRef.current;
    if (ed && ed.getValue() !== code) {
      isProgrammaticChange.current = true;
      ed.setValue(code);
      isProgrammaticChange.current = false;
    }
  }, [code]);

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

    // When lines are inserted or deleted, recalculate breakpoint line numbers from
    // the raw edit events rather than reading Monaco's decoration positions.
    // Monaco's default stickiness leaves a decoration on the (now-empty) line N when
    // a newline is inserted at col 1, whereas the code—and the breakpoint—should
    // follow the content to line N+1.
    ed.onDidChangeModelContent((event) => {
      if (isProgrammaticChange.current) return;
      const initialBps = breakpointsRef.current;
      if (initialBps.size === 0) return;

      // Process changes from bottom to top so earlier shifts don't affect later ones.
      const changes = [...event.changes].sort((a, b) => b.rangeOffset - a.rangeOffset);

      let bps: Set<number> = initialBps;
      for (const change of changes) {
        const { range, text } = change;
        const startLine = range.startLineNumber;
        const endLine = range.endLineNumber;
        const startCol = range.startColumn;
        const linesAdded = (text.match(/\n/g) || []).length;
        const linesRemoved = endLine - startLine;
        const lineDelta = linesAdded - linesRemoved;

        if (lineDelta === 0) continue; // Same-line edit, no position shifts needed.

        const updated = new Set<number>();
        for (const bp of bps) {
          if (bp < startLine) {
            updated.add(bp); // Before the edit — unaffected.
          } else if (bp > endLine) {
            updated.add(bp + lineDelta); // After the edit — shift by net line delta.
          } else if (bp === startLine && startCol > 1) {
            updated.add(bp); // Edit starts mid-line; content before col stays on this line.
          } else if (bp === startLine && startCol === 1 && linesRemoved === 0) {
            // Pure insertion at col 1: the existing content (and the breakpoint) moves
            // down by the number of inserted lines.
            updated.add(bp + linesAdded);
          } else {
            // Breakpoint is within a replaced range; keep it at the start line.
            updated.add(startLine);
          }
        }
        bps = updated;
      }

      if (bps === initialBps) return;
      const changed =
        bps.size !== initialBps.size || [...bps].some((l) => !initialBps.has(l));
      if (changed) onBreakpointsChangeRef.current?.(bps);
    });

    setEditorReady(true);
  };

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly });
  }, [readOnly]);

  // Scroll to the highlighted line whenever it changes
  useEffect(() => {
    const line = highlightedLines?.next;
    if (line != null && editorRef.current) {
      editorRef.current.revealLineInCenterIfOutsideViewport(line);
    }
  }, [highlightedLines?.next]);

  // Re-apply all decorations whenever highlights, breakpoints, or the editor change
  useEffect(() => {
    const ed = editorRef.current;
    const monaco = monacoRef.current;
    if (!ed || !monaco || !editorReady) return;

    const decorations: MonacoTypes.editor.IModelDeltaDecoration[] = [];

    // if (highlightedLines?.prev != null) {
    //   decorations.push({
    //     range: new monaco.Range(highlightedLines.prev, 1, highlightedLines.prev, 1),
    //     options: {
    //       isWholeLine: true,
    //       className: 'debugger-prev-line',
    //       linesDecorationsClassName: 'debugger-prev-glyph',
    //     },
    //   });
    // }

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
        defaultValue={code}
        onChange={(v) => onChange(v ?? '')}
        onMount={handleMount}
        options={{
          readOnly,
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
