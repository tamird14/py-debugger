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
import '../render-objects/line/LineView';
import '../render-objects/input/InputView';

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
      width: width != null ? '100%' : size,
      height: height != null ? '100%' : size,
    };
  };

  return (
    <div
      className={`
        transition-colors relative
        ${hasElementInfo
          // No border when an element is present: a 1px border with box-sizing:border-box
          // shrinks the content area from 40×40 to 38×38, scaling the SVG at 0.95.
          // That makes shape coordinates drift from cell centers for multi-cell elements.
          ? ''
          : 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'}
        ${isInvalid ? 'opacity-50 grayscale' : ''}
      `}
      style={getCellStyle()}
    >
      {hasElementInfo && renderElement(cellData!.elementInfo!)}
    </div>
  );
});
