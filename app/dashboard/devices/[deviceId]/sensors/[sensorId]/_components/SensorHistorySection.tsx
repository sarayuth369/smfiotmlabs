"use client";

import { useEffect, useState, useTransition } from "react";
import { updateSensorHistoryAction } from "../../actions";
import { getSensorHistoryPoints } from "../history-actions";
import type { HistoryPoint, HistorySummary } from "../history-actions";
import { SvgLineChart } from "@/app/dashboard/_components/SvgLineChart";

const INTERVALS = [10, 30, 60];
const PERIODS: { key: "1h" | "6h" | "24h" | "7d"; label: string }[] = [
  { key: "1h", label: "1 ชั่วโมง" },
  { key: "6h", label: "6 ชั่วโมง" },
  { key: "24h", label: "24 ชั่วโมง" },
  { key: "7d", label: "7 วัน" },
];

export function SensorHistorySection({
  deviceId,
  sensorId,
  unit,
  initialSummary,
}: {
  deviceId: string;
  sensorId: string;
  unit: string;
  initialSummary: HistorySummary;
}) {
  const [enabled, setEnabled] = useState(initialSummary.recordHistory);
  // Sensors saved before the option list was trimmed to 10/30/60 may still
  // hold an old value (e.g. 5 or 15) that the server now rejects — snap it
  // to the closest valid option instead of sending the stale one back.
  const [interval, setInterval_] = useState(
    INTERVALS.includes(initialSummary.intervalMinutes)
      ? initialSummary.intervalMinutes
      : INTERVALS.reduce((closest, m) =>
          Math.abs(m - initialSummary.intervalMinutes) < Math.abs(closest - initialSummary.intervalMinutes) ? m : closest
        )
  );
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const [period, setPeriod] = useState<"1h" | "6h" | "24h" | "7d">("24h");
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [loadingChart, setLoadingChart] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingChart(true);
    getSensorHistoryPoints(deviceId, sensorId, period).then((pts) => {
      if (!cancelled) {
        setPoints(pts);
        setLoadingChart(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [deviceId, sensorId, period]);

  function saveToggle(nextEnabled: boolean, nextInterval: number) {
    setMsg(null);
    startTransition(async () => {
      const r = await updateSensorHistoryAction(deviceId, sensorId, nextEnabled, nextInterval);
      if (!r.ok) {
        setEnabled(!nextEnabled); // revert
        setMsg(r.error ?? "บันทึกไม่สำเร็จ");
      }
    });
  }

  const stats = points.length
    ? {
        current: points[points.length - 1].v,
        min: Math.min(...points.map((p) => p.v)),
        max: Math.max(...points.map((p) => p.v)),
        avg: points.reduce((s, p) => s + p.v, 0) / points.length,
        samples: points.length,
      }
    : null;

  return (
    <div className="card p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold text-brand-800">History</h2>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-brand-800">
            <input
              type="checkbox"
              checked={enabled}
              disabled={pending}
              onChange={(e) => {
                setEnabled(e.target.checked);
                saveToggle(e.target.checked, interval);
              }}
              className="rounded border-border text-brand-600"
            />
            บันทึกประวัติ Sensor
          </label>
          {enabled && (
            <label className="flex items-center gap-2 text-xs text-brand-900/70">
              ทุก
              <select
                value={interval}
                disabled={pending}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setInterval_(v);
                  saveToggle(enabled, v);
                }}
                className="rounded border border-border px-2 py-1 text-xs"
              >
                {INTERVALS.map((m) => (
                  <option key={m} value={m}>
                    {m} นาที
                  </option>
                ))}
              </select>
            </label>
          )}
          {msg && <span className="text-xs text-red-700">{msg}</span>}
          <span className="ml-auto text-xs text-brand-900/50">
            {initialSummary.recordCount.toLocaleString()} records · เก็บ{" "}
            {initialSummary.retentionDays === null ? "ไม่จำกัด" : `${initialSummary.retentionDays} วัน`}
          </span>
        </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition ${
                period === p.key
                  ? "bg-brand-600 text-white"
                  : "border border-border text-brand-800 hover:border-brand-400"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {loadingChart ? (
          <div className="h-[180px] flex items-center justify-center text-sm text-brand-900/40">กำลังโหลด...</div>
        ) : (
          <SvgLineChart points={points} unit={unit} />
        )}

        {stats && (
          <div className="mt-4 grid grid-cols-4 gap-3 text-center">
            <div>
              <div className="text-[10px] text-brand-900/50 uppercase tracking-wider">Min</div>
              <div className="text-sm font-bold text-brand-800">{stats.min.toFixed(1)}</div>
            </div>
            <div>
              <div className="text-[10px] text-brand-900/50 uppercase tracking-wider">Max</div>
              <div className="text-sm font-bold text-brand-800">{stats.max.toFixed(1)}</div>
            </div>
            <div>
              <div className="text-[10px] text-brand-900/50 uppercase tracking-wider">Avg</div>
              <div className="text-sm font-bold text-brand-800">{stats.avg.toFixed(1)}</div>
            </div>
            <div>
              <div className="text-[10px] text-brand-900/50 uppercase tracking-wider">Samples</div>
              <div className="text-sm font-bold text-brand-800">{stats.samples}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
