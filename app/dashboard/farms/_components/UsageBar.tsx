import { formatLimit, usagePercent } from "@/lib/plan-limits";

export function UsageBar({
  label,
  current,
  limit,
  soon = false,
}: {
  label: string;
  current: number;
  limit: number | null;
  soon?: boolean;
}) {
  const pct = usagePercent(current, limit);
  const barColor =
    limit === null
      ? "bg-brand-600"
      : pct >= 100
        ? "bg-red-500"
        : pct >= 80
          ? "bg-amber-500"
          : "bg-brand-600";

  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-brand-900/70 font-medium">{label}</span>
        <span className="text-brand-800 font-semibold">
          {current.toLocaleString()} / {formatLimit(limit)}
          {soon && (
            <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-50 text-brand-600 align-middle">
              Soon
            </span>
          )}
        </span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-brand-50 overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all`}
          style={{ width: `${limit === null ? 8 : pct}%` }}
        />
      </div>
    </div>
  );
}
