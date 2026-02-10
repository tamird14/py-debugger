interface SquareProps {
  color?: string;
  opacity?: number;
  strokeWidth?: number;
}

export function Square({ color = '#10b981', opacity = 1, strokeWidth = 2 }: SquareProps) {
  const fill = color;
  const fillOpacity = opacity;
  // Use stroke color at full opacity for the perimeter
  const stroke = strokeWidth > 0 ? color : 'none';

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="w-full h-full"
    >
      <rect
        x={strokeWidth / 2}
        y={strokeWidth / 2}
        width={100 - strokeWidth}
        height={100 - strokeWidth}
        fill={fill}
        fillOpacity={fillOpacity}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    </svg>
  );
}
