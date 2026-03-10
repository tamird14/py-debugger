import { useState, useCallback, useRef } from 'react';
import type { TextBox } from './types';
import { TextBoxItem, CELL_SIZE } from './TextBoxItem';

interface DrawState {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

interface TextBoxesLayerProps {
  textBoxes: TextBox[];
  selectedId: string | null;
  zoom: number;
  addingTextBox: boolean;
  onSelectTextBox: (id: string | null) => void;
  onTextBoxAdded: (box: TextBox) => void;
  onTextBoxChange: (box: TextBox) => void;
  onTextBoxDelete: (id: string) => void;
}

export function TextBoxesLayer({
  textBoxes,
  selectedId,
  zoom,
  addingTextBox,
  onSelectTextBox,
  onTextBoxAdded,
  onTextBoxChange,
  onTextBoxDelete,
}: TextBoxesLayerProps) {
  const [drawing, setDrawing] = useState<DrawState | null>(null);
  const isDrawingRef = useRef(false);

  const getCellFromOffset = (offsetX: number, offsetY: number) => ({
    col: Math.floor(offsetX / CELL_SIZE),
    row: Math.floor(offsetY / CELL_SIZE),
  });

  const handleOverlayMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!addingTextBox) return;
      e.preventDefault();
      e.stopPropagation();
      const { row, col } = getCellFromOffset(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
      isDrawingRef.current = true;
      setDrawing({ startRow: row, startCol: col, endRow: row, endCol: col });
    },
    [addingTextBox]
  );

  const handleOverlayMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDrawingRef.current || !drawing) return;
      const { row, col } = getCellFromOffset(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
      setDrawing((d) => d ? { ...d, endRow: row, endCol: col } : d);
    },
    [drawing]
  );

  const handleOverlayMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDrawingRef.current || !drawing) return;
      isDrawingRef.current = false;
      const { row, col } = getCellFromOffset(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
      const endRow = row;
      const endCol = col;

      const minRow = Math.max(0, Math.min(drawing.startRow, endRow));
      const minCol = Math.max(0, Math.min(drawing.startCol, endCol));
      const maxRow = Math.max(drawing.startRow, endRow);
      const maxCol = Math.max(drawing.startCol, endCol);

      const widthCells = Math.max(2, maxCol - minCol + 1);
      const heightCells = Math.max(2, maxRow - minRow + 1);

      const newBox: TextBox = {
        id: `text-${Date.now()}`,
        row: minRow,
        col: minCol,
        widthCells,
        heightCells,
        text: '',
        fontSize: 14,
        color: '#111827',
      };

      setDrawing(null);
      onTextBoxAdded(newBox);
    },
    [drawing, onTextBoxAdded]
  );

  // Preview rectangle during drawing
  const previewStyle = drawing
    ? (() => {
        const minRow = Math.min(drawing.startRow, drawing.endRow);
        const minCol = Math.min(drawing.startCol, drawing.endCol);
        const maxRow = Math.max(drawing.startRow, drawing.endRow);
        const maxCol = Math.max(drawing.startCol, drawing.endCol);
        return {
          position: 'absolute' as const,
          left: minCol * CELL_SIZE,
          top: minRow * CELL_SIZE,
          width: Math.max(2, maxCol - minCol + 1) * CELL_SIZE,
          height: Math.max(2, maxRow - minRow + 1) * CELL_SIZE,
          border: '2px dashed #6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.08)',
          pointerEvents: 'none' as const,
          zIndex: 101,
        };
      })()
    : null;

  return (
    <>
      {/* Text box items */}
      {textBoxes.map((box) => (
        <TextBoxItem
          key={box.id}
          box={box}
          zoom={zoom}
          selected={selectedId === box.id}
          onSelect={onSelectTextBox}
          onChange={onTextBoxChange}
          onDelete={onTextBoxDelete}
        />
      ))}

      {/* Drawing preview */}
      {previewStyle && <div style={previewStyle} />}

      {/* Drawing mode overlay — sits on top of everything when active */}
      {addingTextBox && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 100,
            cursor: 'crosshair',
          }}
          onMouseDown={handleOverlayMouseDown}
          onMouseMove={handleOverlayMouseMove}
          onMouseUp={handleOverlayMouseUp}
        />
      )}
    </>
  );
}
