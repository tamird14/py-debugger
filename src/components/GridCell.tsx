import { memo } from 'react';
import type { CellData, ShapeType, ArrowOrientation } from '../types/grid';
import { Circle, Square, Arrow } from './shapes';
import { useTheme } from '../contexts/ThemeContext';

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

const THEME_COLORS = {
  light: {
    arrayName: '#b45309',
    arrayValue: '#1f2937',
    arrayIndex: '#d97706',
    array2dName: '#6d28d9',
    array2dValue: '#1f2937',
    array2dIndex: '#7c3aed',
    intVarText: '#065f46',
    intVarEquals: '#059669',
    intVarBorder: '#34d399',
    labelText: '#1f2937',
    panelTitle: '#64748b',
  },
  dark: {
    arrayName: '#fcd34d',
    arrayValue: '#f9fafb',
    arrayIndex: '#fcd34d',
    array2dName: '#c4b5fd',
    array2dValue: '#f9fafb',
    array2dIndex: '#c4b5fd',
    intVarText: '#a7f3d0',
    intVarEquals: '#6ee7b7',
    intVarBorder: '#6ee7b7',
    labelText: '#f3f4f6',
    panelTitle: '#cbd5e1',
  },
} as const;

export const GridCell = memo(function GridCell({
  cellData,
  isSelected,
  onSelect,
  size,
  width,
  height,
}: GridCellProps) {
  const { darkMode } = useTheme();
  const t = darkMode ? THEME_COLORS.dark : THEME_COLORS.light;
  const ShapeComponent = cellData?.shape ? ShapeComponents[cellData.shape] : null;
  const shapeRotation = cellData?.shapeProps?.rotation || 0;
  const arrowOrientation = cellData?.shapeProps?.orientation;
  const isShapeCell = !!ShapeComponent;
  const isArrayCell = !!cellData?.arrayInfo;
  const is2DArrayCell = !!cellData?.array2dInfo;
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

  const isShapeArray = isArrayCell && !!cellData?.arrayInfo?.elementType;

  const getCellBackground = () => {
    if (isShapeCell) return '';
    if (isShapeArray) return '';
    if (customColor) return 'border-2';
    if (is2DArrayCell) return 'bg-violet-50 dark:bg-violet-900/30 border-violet-400 dark:border-violet-600';
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
    if (customColor && !isShapeCell && !isShapeArray) {
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
        ${isSelected && !isShapeCell && !isShapeArray && !customColor ? 'border-blue-500 border-2' : !isShapeCell && !isShapeArray && !customColor ? 'border-gray-300 dark:border-gray-600' : ''}
        ${isShapeCell || isShapeArray ? 'border-transparent' : ''}
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
      {isArrayCell && (() => {
        const info = cellData.arrayInfo!;
        const hasShapeType = !!info.elementType;
        const showIndex = info.showIndex ?? !hasShapeType;
        const ShapeComp = hasShapeType ? ShapeComponents[info.elementType!] : null;
        const elemColor = info.elementConfig?.color;
        const elemOrientation = info.elementConfig?.orientation;
        const elemRotation = info.elementConfig?.rotation ?? 0;
        const elemAlpha = info.elementConfig?.alpha ?? customOpacity;

        if (hasShapeType && ShapeComp) {
          return (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="flex-1 flex items-center justify-center w-full">
                {info.elementType === 'arrow' ? (
                  <Arrow
                    color={elemColor}
                    opacity={elemAlpha}
                    orientation={elemOrientation as ArrowOrientation}
                    rotation={elemRotation}
                  />
                ) : (
                  <div style={{ transform: elemRotation ? `rotate(${elemRotation}deg)` : undefined, width: '100%', height: '100%' }}>
                    <ShapeComp
                      color={elemColor}
                      opacity={elemAlpha}
                    />
                  </div>
                )}
              </div>
              {showIndex && (
                <span
                  className="font-mono leading-none absolute bottom-0"
                  style={{ color: customColor || t.arrayIndex, fontSize: Math.max(8, Math.round(customFontSize * 0.7)) }}
                >
                  [{info.index}]
                </span>
              )}
            </div>
          );
        }

        return (
          <div className="absolute inset-0 flex flex-col items-center justify-between py-1">
            {info.varName && info.index === 0 && (
              <span
                className="text-[8px] font-mono leading-none absolute -top-3 left-0"
                style={{ color: customColor || t.arrayName }}
              >
                {info.varName}
              </span>
            )}
            <div className="flex-1 flex items-center justify-center">
              <span
                className="font-mono font-bold"
                style={{ color: customColor || t.arrayValue, fontSize: customFontSize }}
              >
                {info.value}
              </span>
            </div>
            {showIndex && (
              <span
                className="font-mono leading-none"
                style={{ color: customColor || t.arrayIndex, fontSize: Math.max(8, Math.round(customFontSize * 0.7)) }}
              >
                [{info.index}]
              </span>
            )}
          </div>
        );
      })()}

      {/* 2D Array cell display */}
      {is2DArrayCell && (() => {
        const info = cellData.array2dInfo!;
        const isAnchor = info.row === 0 && info.col === 0;
        const showIndices = info.showIndices ?? true;
        return (
          <div className="absolute inset-0 flex flex-col items-center justify-between py-1">
            {isAnchor && info.varName && (
              <span
                className="text-[8px] font-mono leading-none absolute -top-3 left-0"
                style={{ color: customColor || t.array2dName }}
              >
                {info.varName}
              </span>
            )}
            <div className="flex-1 flex items-center justify-center">
              <span
                className="font-mono font-bold"
                style={{ color: customColor || t.array2dValue, fontSize: customFontSize }}
              >
                {info.value}
              </span>
            </div>
            {showIndices && (
              <span
                className="font-mono leading-none"
                style={{ color: customColor || t.array2dIndex, fontSize: Math.max(7, Math.round(customFontSize * 0.65)) }}
              >
                [{info.row}][{info.col}]
              </span>
            )}
          </div>
        );
      })()}

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
        const borderColor = customColor || t.intVarBorder;
        const textColor = customColor || t.intVarText;

        return (
          <div
            className="absolute inset-y-0 left-0 flex items-center z-10"
            style={{ overflow: 'visible' }}
          >
            <div
              className={`h-full flex items-center justify-center ${!customColor ? 'bg-emerald-50 dark:bg-emerald-900/30' : ''}`}
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
                    <span style={{ color: customColor || t.intVarEquals }}>=</span>
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
            style={{ color: customColor || t.labelText, fontSize: customFontSize }}
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
              className="absolute -top-3 left-1 text-[10px] font-mono bg-slate-50 dark:bg-slate-800 px-1"
              style={{ color: customColor || t.panelTitle }}
            >
              {cellData.panel!.title}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
