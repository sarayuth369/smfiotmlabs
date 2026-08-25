"use client";

// Minimal dependency-free line chart. No charting library added — this
// project has none, and the phase explicitly asks for something clean
// and small rather than a full analytics stack.

export function SvgLineChart({
  points,
  unit,
  height = 180,
}: {
  points: { t: string; v: number }[];
  unit: string;
  height?: number;
}) {
  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-brand-900/40 border border-dashed border-brand-200 rounded-lg"
        style={{ height }}
      >
        ไม่มีข้อมูลในช่วงเวลานี้
      </div>
    );
  }

  const width = 600;
  const padL = 40;
  const padR = 10;
  const padT = 10;
  const padB = 24;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const values = points.map((p) => p.v);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;
  const times = points.map((p) => new Date(p.t).getTime());
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const timeRange = maxT - minT || 1;

  const x = (t: number) => padL + ((t - minT) / timeRange) * innerW;
  const y = (v: number) => padT + innerH - ((v - minV) / range) * innerH;

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(new Date(p.t).getTime()).toFixed(1)} ${y(p.v).toFixed(1)}`)
    .join(" ");

  const last = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
      {/* gridlines */}
      {[0, 0.5, 1].map((f) => (
        <line
          key={f}
          x1={padL}
          x2={width - padR}
          y1={padT + innerH * f}
          y2={padT + innerH * f}
          stroke="currentColor"
          className="text-brand-100"
          strokeWidth={1}
        />
      ))}
      <text x={2} y={padT + 4} className="fill-brand-900/40" fontSize="9">
        {maxV.toFixed(1)}
      </text>
      <text x={2} y={padT + innerH + 4} className="fill-brand-900/40" fontSize="9">
        {minV.toFixed(1)}
      </text>
      <path d={path} fill="none" stroke="var(--brand-600, #16a34a)" strokeWidth={2} />
      <circle cx={x(new Date(last.t).getTime())} cy={y(last.v)} r={3} fill="var(--brand-600, #16a34a)" />
      <text
        x={x(new Date(last.t).getTime())}
        y={y(last.v) - 8}
        textAnchor="end"
        className="fill-brand-800 font-semibold"
        fontSize="11"
      >
        {last.v.toFixed(1)} {unit}
      </text>
    </svg>
  );
}
