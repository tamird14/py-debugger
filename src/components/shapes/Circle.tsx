interface CircleProps {
  color?: string;
  opacity?: number;
  strokeWidth?: number;
}

export function Circle({ color = '#10b981', opacity = 1, strokeWidth = 2 }: CircleProps) {
  const fill = color;
  const fillOpacity = opacity;
  const stroke = strokeWidth > 0 ? color : 'none';
  const radius = 50 - strokeWidth / 2;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="w-full h-full"
    >
      <ellipse
        cx="50"
        cy="50"
        rx={radius}
        ry={radius}
        fill={fill}
        fillOpacity={fillOpacity}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    </svg>
  );
}
