"use client";

export function SvgBarChart({
  data,
  unit,
  height = 180,
}: {
  data: { label: string; avg: number; min: number; max: number }[];
  unit: string;
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-brand-900/40 border border-dashed border-brand-200 rounded-lg"
        style={{ height }}
      >
        ไม่มีข้อมูล
      </div>
    );
  }

  const width = Math.max(300, data.length * 60);
  const padL = 40;
  const padR = 10;
  const padT = 16;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const maxV = Math.max(...data.map((d) => d.max));
  const minV = Math.min(...data.map((d) => d.min));
  const range = maxV - minV || 1;
  const barW = (innerW / data.length) * 0.5;

  const y = (v: number) => padT + innerH - ((v - minV) / range) * innerH;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ height }} className="w-full">
      {data.map((d, i) => {
        const cx = padL + (innerW / data.length) * (i + 0.5);
        const yAvg = y(d.avg);
        const yMin = y(d.min);
        const yMax = y(d.max);
        return (
          <g key={i}>
            {/* min-max range line */}
            <line x1={cx} x2={cx} y1={yMax} y2={yMin} stroke="currentColor" className="text-brand-200" strokeWidth={2} />
            {/* average bar */}
            <rect
              x={cx - barW / 2}
              y={yAvg - 3}
              width={barW}
              height={6}
              rx={2}
              fill="var(--brand-600, #16a34a)"
            />
            <text x={cx} y={height - 8} textAnchor="middle" fontSize="9" className="fill-brand-900/50">
              {d.label}
            </text>
          </g>
        );
      })}
      <text x={2} y={padT + 4} fontSize="9" className="fill-brand-900/40">
        {maxV.toFixed(0)} {unit}
      </text>
      <text x={2} y={padT + innerH} fontSize="9" className="fill-brand-900/40">
        {minV.toFixed(0)}
      </text>
    </svg>
  );
}
