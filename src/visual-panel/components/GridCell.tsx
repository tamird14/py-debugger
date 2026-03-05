import { memo } from 'react';
import type { RenderableObjectData } from '../types/grid';
import { renderElement } from '../views/rendererRegistry';

import '../render-objects/rect/RectView';
import '../render-objects/circle/CircleView';
import '../render-objects/arrow/ArrowView';
import '../render-objects/label/LabelView';
import '../render-objects/array/ArrayValueView';
import '../render-objects/array/Array2DView';
import '../render-objects/panel/PanelView';

interface GridCellProps {
  row: number;
  col: number;
  cellData?: RenderableObjectData;
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
