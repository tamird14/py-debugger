import { Square } from '../shapes';
import type { Array2DCell } from '../types/arrayShapes';
import { registerRenderer } from './rendererRegistry';
import { useTheme } from '../../contexts/ThemeContext';

interface Array2DCellViewProps {
  cell: Array2DCell;
}

export function Array2DCellView({ cell }: Array2DCellViewProps) {
  const { darkMode } = useTheme();
  const color = cell.style?.color || '#8b5cf6';
  const opacity = cell.style?.opacity ?? 1;
  const fontSize = cell.style?.fontSize || 12;
  const isAnchor = cell.row === 0 && cell.col === 0;

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <Square
        color={color}
        opacity={opacity * 0.15}
        strokeWidth={1}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-between py-1">
        {isAnchor && cell.varName && (
          <span
            className="text-[8px] font-mono leading-none absolute -top-3 left-0"
            style={{ color }}
          >
            {cell.varName}
          </span>
        )}
        <div className="flex-1 flex items-center justify-center">
          <span
            className="font-mono font-bold"
            style={{ color: darkMode ? '#f9fafb' : '#1f2937', fontSize }}
          >
            {cell.value}
          </span>
        </div>
        {cell.showIndices && (
          <span
            className="font-mono leading-none"
            style={{ color, fontSize: Math.max(7, Math.round(fontSize * 0.65)) }}
          >
            [{cell.row}][{cell.col}]
          </span>
        )}
      </div>
    </div>
  );
}

registerRenderer<Array2DCell>('array2dcell', (element) => (
  <Array2DCellView cell={element as Array2DCell} />
));
