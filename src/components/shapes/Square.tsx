interface SquareProps {
  color?: string;
}

export function Square({ color = '#10b981' }: SquareProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full"
      style={{ padding: '15%' }}
    >
      <rect x="10" y="10" width="80" height="80" fill={color} />
    </svg>
  );
}
