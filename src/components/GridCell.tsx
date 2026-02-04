import { memo } from 'react';
import type { CellData, ShapeType } from '../types/grid';
import { Circle, Square, Arrow } from './shapes';

interface GridCellProps {
  row: number;
  col: number;
  cellData?: CellData;
  isSelected: boolean;
  onSelect: () => void;
  size: number;
}

const ShapeComponents: Record<ShapeType, React.ComponentType<{ color?: string }>> = {
  circle: Circle,
  square: Square,
  arrow: Arrow,
};

export const GridCell = memo(function GridCell({
  cellData,
  isSelected,
  onSelect,
  size,
}: GridCellProps) {
  const ShapeComponent = cellData?.shape ? ShapeComponents[cellData.shape] : null;
  const isArrayCell = !!cellData?.arrayInfo;
  const isIntVarCell = !!cellData?.intVar;

  const customColor = cellData?.style?.color;
  const customLineWidth = cellData?.style?.lineWidth || 1;

  const getCellBackground = () => {
    if (customColor) {
      return `border-2`;
    }
    if (isArrayCell) return 'bg-amber-50 border-amber-400';
    if (isIntVarCell) return 'bg-emerald-50 border-emerald-400';
    if (isSelected) return 'bg-blue-100';
    return 'bg-white hover:bg-gray-50';
  };

  const getCellStyle = (): React.CSSProperties => {
    const style: React.CSSProperties = {
      width: size,
      height: size,
    };
    if (customColor) {
      style.borderColor = customColor;
      style.borderWidth = customLineWidth;
      style.backgroundColor = `${customColor}20`; // 20 = ~12% opacity in hex
    }
    return style;
  };

  return (
    <div
      className={`
        border cursor-pointer transition-colors relative
        ${isSelected && !customColor ? 'border-blue-500 border-2' : !customColor ? 'border-gray-300' : ''}
        ${getCellBackground()}
      `}
      style={getCellStyle()}
      onClick={onSelect}
    >
      {ShapeComponent && <ShapeComponent color={customColor} />}

      {/* Array cell display */}
      {isArrayCell && (
        <div className="absolute inset-0 flex flex-col items-center justify-between py-1">
          {/* Variable name at top if present */}
          {cellData.arrayInfo!.varName && cellData.arrayInfo!.index === 0 && (
            <span
              className="text-[8px] font-mono leading-none absolute -top-3 left-0"
              style={{ color: customColor || '#b45309' }}
            >
              {cellData.arrayInfo!.varName}
            </span>
          )}
          {/* Value - main content */}
          <div className="flex-1 flex items-center justify-center">
            <span
              className="text-base font-mono font-bold"
              style={{ color: customColor || '#1f2937' }}
            >
              {cellData.arrayInfo!.value}
            </span>
          </div>
          {/* Index - small at bottom with brackets */}
          <span
            className="text-[9px] font-mono leading-none"
            style={{ color: customColor || '#d97706' }}
          >
            [{cellData.arrayInfo!.index}]
          </span>
        </div>
      )}

      {/* Int variable cell display */}
      {isIntVarCell && (() => {
        const text = `${cellData.intVar!.name}=${cellData.intVar!.value}`;
        const charWidth = 7.2; // Approximate width per character for text-xs mono
        const textWidth = text.length * charWidth + 8; // +8 for padding
        const cellsNeeded = Math.ceil(textWidth / size);
        const totalWidth = cellsNeeded * size;
        const bgColor = customColor ? `${customColor}20` : undefined;
        const borderColor = customColor || '#34d399';
        const textColor = customColor || '#065f46';

        return (
          <div
            className="absolute inset-y-0 left-0 flex items-center z-10"
            style={{ overflow: 'visible' }}
          >
            <div
              className={`h-full flex items-center justify-center ${!customColor ? 'bg-emerald-50' : ''}`}
              style={{
                width: totalWidth,
                backgroundColor: bgColor,
                border: `${customLineWidth}px solid ${borderColor}`,
              }}
            >
              <span
                className="text-xs font-mono whitespace-nowrap px-1"
                style={{ color: textColor }}
              >
                <span className="font-semibold">{cellData.intVar!.name}</span>
                <span style={{ color: customColor || '#059669' }}>=</span>
                <span className="font-bold">{cellData.intVar!.value}</span>
              </span>
            </div>
          </div>
        );
      })()}
    </div>
  );
});
