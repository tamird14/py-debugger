interface ArrayValueViewProps {
  value?: string | number;
  varName?: string;
  index: number;
  showIndex: boolean;
  nameColor: string;
  valueColor: string;
  indexColor: string;
  fontSize: number;
}

export function ArrayValueView({
  value,
  varName,
  index,
  showIndex,
  nameColor,
  valueColor,
  indexColor,
  fontSize,
}: ArrayValueViewProps) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-between py-1">
      {varName && index === 0 && (
        <span
          className="text-[8px] font-mono leading-none absolute -top-3 left-0"
          style={{ color: nameColor }}
        >
          {varName}
        </span>
      )}
      <div className="flex-1 flex items-center justify-center">
        <span
          className="font-mono font-bold"
          style={{ color: valueColor, fontSize }}
        >
          {value}
        </span>
      </div>
      {showIndex && (
        <span
          className="font-mono leading-none"
          style={{ color: indexColor, fontSize: Math.max(8, Math.round(fontSize * 0.7)) }}
        >
          [{index}]
        </span>
      )}
    </div>
  );
}

