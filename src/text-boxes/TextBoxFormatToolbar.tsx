import type { TextBox } from './types';

const FONT_SIZES = [10, 12, 14, 16, 18, 24, 32, 48];

interface TextBoxFormatToolbarProps {
  box: TextBox;
  onChange: (patch: Partial<TextBox>) => void;
  onDelete: () => void;
}

export function TextBoxFormatToolbar({ box, onChange, onDelete }: TextBoxFormatToolbarProps) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 6px',
        backgroundColor: '#1f2937',
        border: '1px solid #374151',
        borderRadius: 4,
        whiteSpace: 'nowrap',
        zIndex: 60,
        pointerEvents: 'auto',
      }}
      onMouseDown={(e) => e.stopPropagation()} // don't trigger move drag
    >
      {/* Font size */}
      <select
        value={box.fontSize}
        onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
        title="Font size"
        style={{
          background: '#374151',
          color: '#f9fafb',
          border: '1px solid #4b5563',
          borderRadius: 3,
          fontSize: 11,
          padding: '1px 2px',
          cursor: 'pointer',
        }}
      >
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>{s}px</option>
        ))}
      </select>

      {/* Text color */}
      <label title="Text color" style={{ display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer' }}>
        <span style={{ color: '#f9fafb', fontSize: 11 }}>A</span>
        <input
          type="color"
          value={box.color}
          onChange={(e) => onChange({ color: e.target.value })}
          style={{ width: 20, height: 20, padding: 0, border: 'none', cursor: 'pointer', background: 'none' }}
        />
      </label>

      {/* Background color */}
      <label title="Background color" style={{ display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer' }}>
        <span style={{ color: '#9ca3af', fontSize: 11 }}>bg</span>
        <input
          type="color"
          value={box.bgColor ?? '#ffffff'}
          onChange={(e) => onChange({ bgColor: e.target.value })}
          style={{ width: 20, height: 20, padding: 0, border: 'none', cursor: 'pointer', background: 'none' }}
        />
      </label>

      {/* Clear background */}
      <button
        onClick={() => onChange({ bgColor: undefined })}
        title="Remove background"
        style={{
          background: 'none',
          border: '1px solid #4b5563',
          borderRadius: 3,
          color: '#9ca3af',
          fontSize: 11,
          padding: '1px 4px',
          cursor: 'pointer',
          lineHeight: 1,
        }}
      >
        ✕bg
      </button>

      {/* Divider */}
      <div style={{ width: 1, height: 16, background: '#4b5563' }} />

      {/* Delete */}
      <button
        onClick={onDelete}
        title="Delete text box"
        style={{
          background: 'none',
          border: '1px solid #ef4444',
          borderRadius: 3,
          color: '#ef4444',
          fontSize: 11,
          padding: '1px 5px',
          cursor: 'pointer',
          lineHeight: 1,
        }}
      >
        🗑
      </button>
    </div>
  );
}
