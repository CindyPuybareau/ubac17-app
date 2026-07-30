function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArcFlag = startAngle - endAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

export default function GaugeChart({
  percentage,
  label,
  color = "#22c55e",
}: {
  percentage: number;
  label?: string;
  color?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percentage));
  const cx = 100;
  const cy = 100;
  const r = 80;
  const strokeWidth = 18;
  const endAngle = 180 - (clamped / 100) * 180;

  return (
    <svg viewBox="0 0 200 120" className="w-full max-w-[220px]">
      <path
        d={arcPath(cx, cy, r, 180, 0)}
        fill="none"
        stroke="currentColor"
        className="text-zinc-100"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d={arcPath(cx, cy, r, 180, endAngle)}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <text
        x={cx}
        y={cy - 6}
        textAnchor="middle"
        className="fill-zinc-900"
        style={{ fontSize: 30, fontWeight: 700 }}
      >
        {Math.round(clamped)}%
      </text>
      {label && (
        <text
          x={cx}
          y={cy + 16}
          textAnchor="middle"
          className="fill-zinc-500"
          style={{ fontSize: 11, fontWeight: 600 }}
        >
          {label}
        </text>
      )}
    </svg>
  );
}
