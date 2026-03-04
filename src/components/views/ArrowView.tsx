import { Arrow } from '../shapes';
import type { ArrowOrientation } from '../../types/grid';

interface ArrowViewProps {
  color?: string;
  opacity?: number;
  strokeWidth?: number;
  orientation?: ArrowOrientation;
  rotation?: number;
}

export function ArrowView({ color, opacity, strokeWidth, orientation, rotation }: ArrowViewProps) {
  return (
    <Arrow
      color={color}
      opacity={opacity}
      strokeWidth={strokeWidth}
      orientation={orientation}
      rotation={rotation}
    />
  );
}


