import { memo } from 'react';
import type { CellData } from '../types/grid';
import { useTheme } from '../contexts/ThemeContext';
import { Square } from './shapes';
import {
  ArrayValueView,
  Array2DView,
  PanelView,
} from './views';
import { renderElement } from './views/rendererRegistry';

import './views/RectView';
import './views/CircleView';
import './views/ArrowView';
import './views/LabelView';

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
  const hasElementInfo = !!cellData?.elementInfo;
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

  const getCellBackground = () => {
    if (hasElementInfo) return '';
    if (isArrayCell || is2DArrayCell) return '';
    if (customColor) return 'border-2';
    return 'bg-white dark:bg-gray-800';
  };

  const getCellStyle = (): React.CSSProperties => {
    const style: React.CSSProperties = {
      width: width || size,
      height: height || size,
    };
    if (customColor && !hasElementInfo && !isArrayCell && !is2DArrayCell) {
      style.borderColor = withOpacity(customColor, Math.min(1, Math.max(0, customOpacity)));
      style.borderWidth = customLineWidth;
      style.backgroundColor = withOpacity(customColor, Math.min(1, Math.max(0, customOpacity * 0.12)));
    }
    return style;
  };

  const isInvalid = !!cellData?.invalidReason;

  const renderArrayCell = () => {
    if (!isArrayCell) return null;
    const info = cellData.arrayInfo!;
    const showIndex = info.showIndex ?? true;

    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <Square
          color={customColor || (darkMode ? '#f59e0b' : '#f59e0b')}
          opacity={customOpacity * 0.15}
          strokeWidth={1}
        />
        <div className="absolute inset-0">
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
        </div>
      </div>
    );
  };

  const render2DArrayCell = () => {
    if (!is2DArrayCell) return null;

    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <Square
          color={customColor || (darkMode ? '#8b5cf6' : '#8b5cf6')}
          opacity={customOpacity * 0.15}
          strokeWidth={1}
        />
        <div className="absolute inset-0">
          <Array2DView
            array2dInfo={cellData.array2dInfo!}
            cellStyle={{ color: customColor || t.array2dName }}
            valueStyle={{ color: customColor || t.array2dValue, fontSize: customFontSize }}
            indexStyle={{ color: customColor || t.array2dIndex, fontSize: Math.max(7, Math.round(customFontSize * 0.65)) }}
          />
        </div>
      </div>
    );
  };

  return (
    <div
      className={`
        border transition-colors relative
        ${!hasElementInfo && !isArrayCell && !is2DArrayCell && !customColor ? 'border-gray-300 dark:border-gray-600' : ''}
        ${hasElementInfo || isArrayCell || is2DArrayCell ? 'border-transparent' : ''}
        ${getCellBackground()}
        ${isInvalid ? 'opacity-50 grayscale' : ''}
      `}
      style={getCellStyle()}
    >
      {hasElementInfo && renderElement(cellData!.elementInfo!)}
      {renderArrayCell()}
      {render2DArrayCell()}

      {isPanelCell && (
        <PanelView
          title={cellData.panel!.title}
          titleColor={customColor || t.panelTitle}
        />
      )}
    </div>
  );
});
