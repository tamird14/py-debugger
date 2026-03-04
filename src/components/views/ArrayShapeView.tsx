import { Arrow } from '../shapes';
import { CircleView } from './CircleView';
import { RectView } from './RectView';
import type { ShapeType, ArrowOrientation } from '../../types/grid';
import type { ClassDoc } from '../../types/visualBuilder';

interface ArrayShapeViewProps {
  elementType: ShapeType;
  color?: string;
  alpha?: number;
  orientation?: ArrowOrientation;
  rotation?: number;
  index: number;
  showIndex: boolean;
  indexColor: string;
  indexFontSize: number;
}

export function ArrayShapeView({
  elementType,
  color,
  alpha,
  orientation,
  rotation = 0,
  index,
  showIndex,
  indexColor,
  indexFontSize,
}: ArrayShapeViewProps) {
  const renderShape = () => {
    if (elementType === 'arrow') {
      return (
        <Arrow
          color={color}
          opacity={alpha}
          orientation={orientation}
          rotation={rotation}
        />
      );
    }
    if (elementType === 'circle') {
      return <CircleView color={color} opacity={alpha} rotation={rotation} />;
    }
    return <RectView color={color} opacity={alpha} rotation={rotation} />;
  };

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center">
      <div className="flex-1 flex items-center justify-center w-full">
        {renderShape()}
      </div>
      {showIndex && (
        <span
          className="font-mono leading-none absolute bottom-0"
          style={{ color: indexColor, fontSize: indexFontSize }}
        >
          [{index}]
        </span>
      )}
    </div>
  );
}

