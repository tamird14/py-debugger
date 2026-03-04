import { memo } from 'react';
import type { CellData } from '../types/grid';
import { renderElement } from '../views/rendererRegistry';

import '../views/RectView';
import '../views/CircleView';
import '../views/ArrowView';
import '../views/LabelView';
import '../views/ArrayValueView';
import '../views/Array2DView';
import '../views/PanelView';

interface GridCellProps {
  row: number;
  col: number;
  cellData?: CellData;
  size: number;
  width?: number;
  height?: number;
}

export const GridCell = memo(function GridCell({
  cellData,
  size,
  width,
  height,
}: GridCellProps) {
  const hasElementInfo = !!cellData?.elementInfo;
  const isInvalid = !!cellData?.invalidReason;

  const getCellStyle = (): React.CSSProperties => {
    return {
      width: width || size,
      height: height || size,
    };
  };

  return (
    <div
      className={`
        border transition-colors relative
        ${hasElementInfo ? 'border-transparent' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'}
        ${isInvalid ? 'opacity-50 grayscale' : ''}
      `}
      style={getCellStyle()}
    >
      {hasElementInfo && renderElement(cellData!.elementInfo!)}
    </div>
  );
});
