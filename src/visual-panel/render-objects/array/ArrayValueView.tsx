import { Square } from '../../shapes';
import type { Array1DCell } from './arrayShapes';
import { registerRenderer } from '../../views/rendererRegistry';
import { useTheme } from '../../../contexts/ThemeContext';

interface Array1DCellViewProps {
  cell: Array1DCell;
}

export function Array1DCellView({ cell }: Array1DCellViewProps) {
  const { darkMode } = useTheme();
  const color = cell.style?.color || '#f59e0b';
  const opacity = cell.style?.opacity ?? 1;
  const fontSize = cell.style?.fontSize || 12;

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <Square
        color={color}
        opacity={opacity * 0.15}
        strokeWidth={1}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-between py-1">
        <div className="flex-1 flex items-center justify-center">
          <span
            className="font-mono font-bold"
            style={{ color: darkMode ? '#f9fafb' : '#1f2937', fontSize }}
          >
            {cell.value}
          </span>
        </div>
        {cell.showIndex && (
          <span
            className="font-mono leading-none"
            style={{ color, fontSize: Math.max(8, Math.round(fontSize * 0.7)) }}
          >
            [{cell.index}]
          </span>
        )}
      </div>
    </div>
  );
}

registerRenderer<Array1DCell>('array1dcell', (element) => (
  <Array1DCellView cell={element as Array1DCell} />
));
