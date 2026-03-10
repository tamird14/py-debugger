import { useRef, useEffect } from 'react';
import type { TextBox } from './types';

export const CELL_SIZE = 40;

interface TextBoxItemProps {
  box: TextBox;
  selected: boolean;
  onSelect: (id: string) => void;
  onChange: (box: TextBox) => void;
}

export function TextBoxItem({ box, selected, onSelect, onChange }: TextBoxItemProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus when first selected (new box)
  useEffect(() => {
    if (selected && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [selected]);

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
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        onSelect(box.id);
      }}
    >
      <textarea
        ref={textareaRef}
        value={box.text}
        onChange={(e) => onChange({ ...box, text: e.target.value })}
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
    </div>
  );
}
