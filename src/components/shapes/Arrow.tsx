import type { ArrowOrientation } from '../../types/grid';

interface ArrowProps {
  color?: string;
  opacity?: number;
  strokeWidth?: number;
  orientation?: ArrowOrientation;
  rotation?: number;
}

const ORIENTATION_DEGREES: Record<ArrowOrientation, number> = {
  up: 0,
  right: 90,
  down: 180,
  left: 270,
};

export function Arrow({
  color = '#10b981',
  opacity = 1,
  strokeWidth = 0,
  orientation = 'up',
  rotation = 0,
}: ArrowProps) {
  const baseRotation = ORIENTATION_DEGREES[orientation] ?? 0;
  const fill = color;
  const fillOpacity = opacity;
  const stroke = strokeWidth > 0 ? color : 'none';

  return (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full"
      style={{ transform: `rotate(${baseRotation + rotation}deg)` }}
    >
      <polygon
        points="50,80 20,30 40,30 40,10 60,10 60,30 80,30"
        fill={fill}
        fillOpacity={fillOpacity}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    </svg>
  );
}
