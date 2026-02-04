interface CircleProps {
  color?: string;
}

export function Circle({ color = '#3b82f6' }: CircleProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full"
      style={{ padding: '15%' }}
    >
      <circle cx="50" cy="50" r="40" fill={color} />
    </svg>
  );
}
