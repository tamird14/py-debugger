import { useRef, useEffect, useCallback } from 'react';
import type { TextBox } from './types';
import { TextBoxFormatToolbar } from './TextBoxFormatToolbar';

export const CELL_SIZE = 40;
const MIN_CELLS = 2;
const HANDLE_SIZE = 10;

interface TextBoxItemProps {
  box: TextBox;
  zoom: number;
  selected: boolean;
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

export function TextBoxItem({ box, zoom, selected, onSelect, onChange, onDelete }: TextBoxItemProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (selected && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [selected]);

  // ── Drag to move ──────────────────────────────────────────────────────────

  const handleBodyMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect(box.id);

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
    [box, zoom, onSelect, onChange]
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
        border: selected ? '2px solid #6366f1' : '1px dashed #9ca3af',
        boxSizing: 'border-box',
        zIndex: 50,
        overflow: 'visible',
        pointerEvents: 'auto',
        cursor: selected ? 'move' : 'default',
      }}
      onMouseDown={handleBodyMouseDown}
    >
      {/* Formatting toolbar — shown above the box when selected */}
      {selected && (
        <TextBoxFormatToolbar
          box={box}
          onChange={(patch) => onChange({ ...box, ...patch })}
          onDelete={() => onDelete(box.id)}
        />
      )}

      <textarea
        ref={textareaRef}
        value={box.text}
        onChange={(e) => onChange({ ...box, text: e.target.value })}
        onMouseDown={(e) => {
          if (selected) e.stopPropagation(); // prevent move drag when editing
        }}
        style={{
          width: '100%',
          height: '100%',
          resize: 'none',
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: box.color,
          fontSize: box.fontSize,
          fontFamily: 'inherit',
          padding: '4px',
          boxSizing: 'border-box',
          cursor: selected ? 'text' : 'default',
          pointerEvents: selected ? 'auto' : 'none',
        }}
        placeholder={selected ? 'Type here...' : ''}
      />

      {/* Corner resize handles */}
      {selected &&
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
