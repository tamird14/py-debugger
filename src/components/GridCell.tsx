import { memo } from 'react';
import type { CellData, ArrowOrientation } from '../types/grid';
import { useTheme } from '../contexts/ThemeContext';
import {
  RectView,
  CircleView,
  ArrowView,
  ArrayShapeView,
  ArrayValueView,
  Array2DView,
  LabelView,
  PanelView,
} from './views';

interface GridCellProps {
  row: number;
  col: number;
  cellData?: CellData;
  size: number;
  width?: number;
  height?: number;
}

const THEME_COLORS = {
  light: {
    arrayName: '#b45309',
    arrayValue: '#1f2937',
    arrayIndex: '#d97706',
    array2dName: '#6d28d9',
    array2dValue: '#1f2937',
    array2dIndex: '#7c3aed',
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
    labelText: '#f3f4f6',
    panelTitle: '#cbd5e1',
  },
} as const;

export const GridCell = memo(function GridCell({
  cellData,
  size,
  width,
  height,
}: GridCellProps) {
  const { darkMode } = useTheme();
  const t = darkMode ? THEME_COLORS.dark : THEME_COLORS.light;
  const shapeRotation = cellData?.shapeProps?.rotation || 0;
  const arrowOrientation = cellData?.shapeProps?.orientation;
  const isShapeCell = !!cellData?.shape;
  const isArrayCell = !!cellData?.arrayInfo;
  const is2DArrayCell = !!cellData?.array2dInfo;
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
    return 'bg-white dark:bg-gray-800';
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

  const renderStandaloneShape = () => {
    if (!cellData?.shape) return null;
    switch (cellData.shape) {
      case 'arrow':
        return (
          <ArrowView
            color={customColor}
            opacity={customOpacity}
            strokeWidth={customLineWidth}
            orientation={arrowOrientation}
            rotation={shapeRotation}
          />
        );
      case 'circle':
        return (
          <CircleView
            color={customColor}
            opacity={customOpacity}
            strokeWidth={customLineWidth}
            rotation={shapeRotation}
          />
        );
      case 'square':
      case 'rectangle':
        return (
          <RectView
            color={customColor}
            opacity={customOpacity}
            strokeWidth={customLineWidth}
            rotation={shapeRotation}
          />
        );
      default:
        return null;
    }
  };

  const renderArrayCell = () => {
    if (!isArrayCell) return null;
    const info = cellData.arrayInfo!;
    const hasShapeType = !!info.elementType;
    const showIndex = info.showIndex ?? !hasShapeType;

    if (hasShapeType) {
      return (
        <ArrayShapeView
          elementType={info.elementType!}
          color={info.elementConfig?.color}
          alpha={info.elementConfig?.alpha ?? customOpacity}
          orientation={info.elementConfig?.orientation as ArrowOrientation}
          rotation={info.elementConfig?.rotation ?? 0}
          index={info.index}
          showIndex={showIndex}
          indexColor={customColor || t.arrayIndex}
          indexFontSize={Math.max(8, Math.round(customFontSize * 0.7))}
        />
      );
    }

    return (
      <ArrayValueView
        value={info.value}
        varName={info.varName}
        index={info.index}
        showIndex={showIndex}
        nameColor={customColor || t.arrayName}
        valueColor={customColor || t.arrayValue}
        indexColor={customColor || t.arrayIndex}
        fontSize={customFontSize}
      />
    );
  };

  return (
    <div
      className={`
        border transition-colors relative
        ${!isShapeCell && !isShapeArray && !customColor ? 'border-gray-300 dark:border-gray-600' : ''}
        ${isShapeCell || isShapeArray ? 'border-transparent' : ''}
        ${getCellBackground()}
        ${isInvalid ? 'opacity-50 grayscale' : ''}
      `}
      style={getCellStyle()}
    >
      {renderStandaloneShape()}

      {renderArrayCell()}

      {is2DArrayCell && (
        <Array2DView
          array2dInfo={cellData.array2dInfo!}
          cellStyle={{ color: customColor || t.array2dName }}
          valueStyle={{ color: customColor || t.array2dValue, fontSize: customFontSize }}
          indexStyle={{ color: customColor || t.array2dIndex, fontSize: Math.max(7, Math.round(customFontSize * 0.65)) }}
        />
      )}

      {!!cellData?.label && (
        <LabelView
          text={cellData.label.text}
          style={{ color: customColor || t.labelText, fontSize: customFontSize }}
        />
      )}

      {isPanelCell && (
        <PanelView
          title={cellData.panel!.title}
          titleColor={customColor || t.panelTitle}
        />
      )}
    </div>
  );
});
