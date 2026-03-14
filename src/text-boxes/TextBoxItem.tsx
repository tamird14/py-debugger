import { useRef, useEffect, useCallback, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Underline } from '@tiptap/extension-underline';
import type { TextBox } from './types';
import { FontSize } from './FontSizeExtension';
import { TextBoxFormatToolbar } from './TextBoxFormatToolbar';
import { useTheme } from '../contexts/ThemeContext';
import './tiptap.css';

export const CELL_SIZE = 40;
const MIN_CELLS = 2;
const HANDLE_SIZE = 10;

interface TextBoxItemProps {
  box: TextBox;
  zoom: number;
  selected: boolean;
  autoEdit?: boolean;
  onSelect: (id: string) => void;
  onChange: (box: TextBox) => void;
  onDelete: (id: string) => void;
}

type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se';

const handlePositions: Record<ResizeHandle, React.CSSProperties> = {
  nw: { top: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2, cursor: 'nw-resize' },
  ne: { top: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2, cursor: 'ne-resize' },
  sw: { bottom: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2, cursor: 'sw-resize' },
  se: { bottom: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2, cursor: 'se-resize' },
};

export function TextBoxItem({ box, zoom, selected, autoEdit, onSelect, onChange, onDelete }: TextBoxItemProps) {
  const { darkMode } = useTheme();
  const [editing, setEditing] = useState(() => autoEdit ?? false);
  const prevBoxId = useRef(box.id);
  // Refs keep onUpdate closure fresh without recreating the editor
  const boxRef = useRef(box);
  const onChangeRef = useRef(onChange);
  useEffect(() => { boxRef.current = box; });
  useEffect(() => { onChangeRef.current = onChange; });

  const editor = useEditor({
    extensions: [StarterKit, TextStyle, Color, FontSize, Underline],
    content: box.content,
    editable: editing,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChangeRef.current({ ...boxRef.current, content: editor.getJSON() });
    },
  });

  // Sync editable mode with editing state.
  // Pass false as second arg to suppress the spurious onUpdate that TipTap
  // emits on setEditable — it normalises list nodes during the transition
  // which causes a stale-content crash for bullet/ordered list boxes.
  useEffect(() => {
    if (editor) editor.setEditable(editing, false);
    if (editing) editor?.commands.focus();
  }, [editor, editing]);

  // Reset editing when deselected
  useEffect(() => {
    if (!selected) setEditing(false);
  }, [selected]);

  // Sync content when switching between boxes
  useEffect(() => {
    if (editor && box.id !== prevBoxId.current) {
      editor.commands.setContent(box.content, false);
      prevBoxId.current = box.id;
    }
  }, [editor, box.id, box.content]);

  // ── Drag to move ──────────────────────────────────────────────────────────

  const handleBodyMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect(box.id);

      if (editing) return;
      e.preventDefault(); // prevent text selection during drag

      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const startCol = box.col;
      const startRow = box.row;

      const onMouseMove = (mv: MouseEvent) => {
        const deltaCol = Math.round((mv.clientX - startClientX) / (CELL_SIZE * zoom));
        const deltaRow = Math.round((mv.clientY - startClientY) / (CELL_SIZE * zoom));
        const newCol = Math.max(0, Math.min(49 - box.widthCells, startCol + deltaCol));
        const newRow = Math.max(0, Math.min(49 - box.heightCells, startRow + deltaRow));
        onChange({ ...box, col: newCol, row: newRow });
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [box, zoom, onSelect, onChange, editing]
  );

  // ── Drag to resize ────────────────────────────────────────────────────────

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent, handle: ResizeHandle) => {
      e.stopPropagation();
      e.preventDefault();

      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const startCol = box.col;
      const startRow = box.row;
      const startW = box.widthCells;
      const startH = box.heightCells;

      const onMouseMove = (mv: MouseEvent) => {
        const dcol = Math.round((mv.clientX - startClientX) / (CELL_SIZE * zoom));
        const drow = Math.round((mv.clientY - startClientY) / (CELL_SIZE * zoom));

        let col = startCol;
        let row = startRow;
        let w = startW;
        let h = startH;

        if (handle === 'nw' || handle === 'sw') {
          const newCol = Math.max(0, Math.min(startCol + startW - MIN_CELLS, startCol + dcol));
          w = Math.max(MIN_CELLS, startW - (newCol - startCol));
          col = newCol;
        } else {
          w = Math.max(MIN_CELLS, Math.min(49 - startCol, startW + dcol));
        }

        if (handle === 'nw' || handle === 'ne') {
          const newRow = Math.max(0, Math.min(startRow + startH - MIN_CELLS, startRow + drow));
          h = Math.max(MIN_CELLS, startH - (newRow - startRow));
          row = newRow;
        } else {
          h = Math.max(MIN_CELLS, Math.min(49 - startRow, startH + drow));
        }

        onChange({ ...box, col, row, widthCells: w, heightCells: h });
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [box, zoom, onChange]
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: 'absolute',
        left: box.col * CELL_SIZE,
        top: box.row * CELL_SIZE,
        width: box.widthCells * CELL_SIZE,
        height: box.heightCells * CELL_SIZE,
        backgroundColor: box.bgColor ?? 'transparent',
        border: selected ? '2px solid #6366f1' : `1px dashed ${darkMode ? '#6b7280' : '#9ca3af'}`,
        boxSizing: 'border-box',
        zIndex: 50,
        overflow: 'visible',
        pointerEvents: 'auto',
        cursor: selected && !editing ? 'move' : 'default',
        color: darkMode ? 'rgba(249, 250, 251, 0.65)' : 'rgba(17, 24, 39, 0.55)',
        userSelect: editing ? 'text' : 'none',
      }}
      onMouseDown={handleBodyMouseDown}
      onDoubleClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && editing) {
          setEditing(false);
          e.preventDefault();
        }
      }}
    >
      {/* Formatting toolbar — shown above the box when selected */}
      {selected && (
        <TextBoxFormatToolbar
          editor={editor}
          box={box}
          onChange={(patch) => onChange({ ...box, ...patch })}
          onDelete={() => onDelete(box.id)}
        />
      )}

      {/* Rich text editor */}
      <div
        style={{
          width: '100%',
          height: '100%',
          overflow: 'auto',
          padding: '4px',
          boxSizing: 'border-box',
          fontSize: 14,
          pointerEvents: editing ? 'auto' : 'none',
          cursor: editing ? 'text' : 'default',
        }}
      >
        <EditorContent editor={editor} style={{ height: '100%' }} />
      </div>

      {/* Corner resize handles — only shown in move mode */}
      {selected && !editing &&
        (Object.entries(handlePositions) as [ResizeHandle, React.CSSProperties][]).map(
          ([handle, style]) => (
            <div
              key={handle}
              style={{
                position: 'absolute',
                width: HANDLE_SIZE,
                height: HANDLE_SIZE,
                backgroundColor: '#6366f1',
                borderRadius: 2,
                zIndex: 51,
                ...style,
              }}
              onMouseDown={(e) => handleResizeMouseDown(e, handle)}
            />
          )
        )}
    </div>
  );
}
