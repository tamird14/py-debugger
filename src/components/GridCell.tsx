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
  width?: number;
  height?: number;
}

interface ShapeComponentProps {
  color?: string;
  opacity?: number;
  strokeWidth?: number;
}

const ShapeComponents: Record<ShapeType, React.ComponentType<ShapeComponentProps>> = {
  circle: Circle,
  square: Square,
  rectangle: Square,
  arrow: Arrow,
};

export const GridCell = memo(function GridCell({
  cellData,
  isSelected,
  onSelect,
  size,
  width,
  height,
}: GridCellProps) {
  const ShapeComponent = cellData?.shape ? ShapeComponents[cellData.shape] : null;
  const shapeRotation = cellData?.shapeProps?.rotation || 0;
  const arrowOrientation = cellData?.shapeProps?.orientation;
  const isShapeCell = !!ShapeComponent;
  const isArrayCell = !!cellData?.arrayInfo;
  const isIntVarCell = !!cellData?.intVar;
  const isLabelCell = !!cellData?.label;
  const isPanelCell = !!cellData?.panel;

  const customColor = cellData?.style?.color;
  const customLineWidth = cellData?.style?.lineWidth || 1;
  const customOpacity = cellData?.style?.opacity ?? 1;
  const customFontSize = cellData?.style?.fontSize || 12;

  const withOpacity = (hexColor: string, opacity: number): string => {
    const normalized = hexColor.replace('#', '');
    if (normalized.length !== 6) return hexColor;
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  };

  const getCellBackground = () => {
    // Shapes handle their own styling via SVG; don't style the cell
    if (isShapeCell) return '';
    if (customColor) return 'border-2';
    if (isArrayCell) return 'bg-amber-50 dark:bg-amber-900/30 border-amber-400 dark:border-amber-600';
    if (isIntVarCell) return 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-400 dark:border-emerald-600';
    if (isSelected) return 'bg-blue-100 dark:bg-blue-900/40';
    return 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700';
  };

  const getCellStyle = (): React.CSSProperties => {
    const style: React.CSSProperties = {
      width: width || size,
      height: height || size,
    };
    // Shapes handle their own fill/stroke via SVG; skip cell-level styling
    if (customColor && !isShapeCell) {
      style.borderColor = withOpacity(customColor, Math.min(1, Math.max(0, customOpacity)));
      style.borderWidth = customLineWidth;
      style.backgroundColor = withOpacity(customColor, Math.min(1, Math.max(0, customOpacity * 0.12)));
    }
    return style;
  };

  const isInvalid = !!cellData?.invalidReason;

  return (
    <div
      className={`
        border cursor-pointer transition-colors relative
        ${isSelected && !isShapeCell && !customColor ? 'border-blue-500 border-2' : !isShapeCell && !customColor ? 'border-gray-300 dark:border-gray-600' : ''}
        ${isShapeCell ? 'border-transparent' : ''}
        ${getCellBackground()}
        ${isInvalid ? 'opacity-50 grayscale' : ''}
      `}
      style={getCellStyle()}
      onClick={onSelect}
    >
      {ShapeComponent && cellData?.shape === 'arrow' ? (
        <Arrow
          color={customColor}
          opacity={customOpacity}
          strokeWidth={customLineWidth}
          orientation={arrowOrientation}
          rotation={shapeRotation}
        />
      ) : ShapeComponent ? (
        <div style={{ transform: `rotate(${shapeRotation}deg)`, width: '100%', height: '100%' }}>
          <ShapeComponent
            color={customColor}
            opacity={customOpacity}
            strokeWidth={customLineWidth}
          />
        </div>
      ) : null}

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
              className="font-mono font-bold"
              style={{ color: customColor || '#1f2937', fontSize: customFontSize }}
            >
              {cellData.arrayInfo!.value}
            </span>
          </div>
          {/* Index - small at bottom with brackets */}
          <span
            className="font-mono leading-none"
            style={{ color: customColor || '#d97706', fontSize: Math.max(8, Math.round(customFontSize * 0.7)) }}
          >
            [{cellData.arrayInfo!.index}]
          </span>
        </div>
      )}

      {/* Int variable cell display */}
      {isIntVarCell && (() => {
        const displayMode = cellData.intVar!.display || 'name-value';
        const text = displayMode === 'value-only'
          ? `${cellData.intVar!.value}`
          : `${cellData.intVar!.name}=${cellData.intVar!.value}`;
        const charWidth = customFontSize * 0.6;
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
                className="font-mono whitespace-nowrap px-1"
                style={{ color: textColor, fontSize: customFontSize }}
              >
                {displayMode === 'value-only' ? (
                  <span className="font-bold">{cellData.intVar!.value}</span>
                ) : (
                  <>
                    <span className="font-semibold">{cellData.intVar!.name}</span>
                    <span style={{ color: customColor || '#059669' }}>=</span>
                    <span className="font-bold">{cellData.intVar!.value}</span>
                  </>
                )}
              </span>
            </div>
          </div>
        );
      })()}

      {/* Label display */}
      {isLabelCell && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="font-mono text-center whitespace-pre-wrap"
            style={{ color: customColor || '#1f2937', fontSize: customFontSize }}
          >
            {cellData.label!.text}
          </span>
        </div>
      )}

      {/* Panel display */}
      {isPanelCell && (
        <div className="absolute inset-0 border-2 border-dashed border-slate-400 dark:border-slate-500 bg-slate-50/50 dark:bg-slate-800/50">
          {cellData.panel!.title && (
            <span
              className="absolute -top-3 left-1 text-[10px] font-mono bg-slate-50 px-1"
              style={{ color: customColor || '#64748b' }}
            >
              {cellData.panel!.title}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
