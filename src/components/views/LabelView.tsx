interface LabelViewProps {
  text: string;
  style?: React.CSSProperties;
}

export function LabelView({ text, style }: LabelViewProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <span
        className="font-mono text-center whitespace-pre-wrap"
        style={style}
      >
        {text}
      </span>
    </div>
  );
}


