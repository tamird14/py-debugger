import { Circle } from '../shapes';

interface CircleViewProps {
  color?: string;
  opacity?: number;
  strokeWidth?: number;
  rotation?: number;
}

export function CircleView({ color, opacity, strokeWidth, rotation = 0 }: CircleViewProps) {
  return (
    <div style={{ transform: `rotate(${rotation}deg)`, width: '100%', height: '100%' }}>
      <Circle color={color} opacity={opacity} strokeWidth={strokeWidth} />
    </div>
  );
}


