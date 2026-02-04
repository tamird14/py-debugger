interface ArrowProps {
  color?: string;
}

export function Arrow({ color = '#ef4444' }: ArrowProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full"
      style={{ padding: '15%' }}
    >
      <polygon points="50,80 20,30 40,30 40,10 60,10 60,30 80,30" fill={color} />
    </svg>
  );
}
