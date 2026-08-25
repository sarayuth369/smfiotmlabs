"use client";

import { useEffect, useState } from "react";
import {
  getSensorSummary,
  getSensorTrend,
  getDailySummary,
  getExportPeriodOptions,
  exportSensorHistoryCsv,
  type ReportSensorOption,
  type SensorSummary,
  type TrendPoint,
  type DailyBar,
  type ExportPeriodInfo,
} from "../actions";
import { SvgLineChart } from "@/app/dashboard/_components/SvgLineChart";
import { SvgBarChart } from "@/app/dashboard/_components/SvgBarChart";
import { FeatureLockedNotice } from "@/app/dashboard/_components/FeatureLockedNotice";

/**
 * Encodes as UTF-16LE with a leading BOM instead of UTF-8. Non-Microsoft-365
 * Excel builds ignore a UTF-8 BOM specifically on .csv files and fall back
 * to the system ANSI codepage (cp874 on Thai Windows), turning Thai text
 * into mojibake — Excel has always correctly auto-detected UTF-16 BOM
 * regardless of version or file extension, so this is the reliable choice.
 * JS strings are already UTF-16 code units, so this is a direct byte copy.
 */
function toUtf16LeWithBom(text: string): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(2 + text.length * 2);
  const bytes = new Uint8Array(buffer);
  bytes[0] = 0xff;
  bytes[1] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    bytes[2 + i * 2] = code & 0xff;
    bytes[2 + i * 2 + 1] = code >> 8;
  }
  return bytes;
}

const PERIODS: { key: "1h" | "6h" | "24h" | "7d"; label: string }[] = [
  { key: "1h", label: "1 ชั่วโมง" },
  { key: "6h", label: "6 ชั่วโมง" },
  { key: "24h", label: "24 ชั่วโมง" },
  { key: "7d", label: "7 วัน" },
];

export function ReportsClient({ farmId, sensors }: { farmId: string; sensors: ReportSensorOption[] }) {
  const [sensorId, setSensorId] = useState(sensors[0]?.id ?? "");
  const [period, setPeriod] = useState<"1h" | "6h" | "24h" | "7d">("24h");
  const [summary, setSummary] = useState<SensorSummary | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [daily, setDaily] = useState<DailyBar[]>([]);
  const [loading, setLoading] = useState(true);

  const [exportInfo, setExportInfo] = useState<ExportPeriodInfo | null>(null);
  const [exportDays, setExportDays] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    getExportPeriodOptions(farmId).then((info) => {
      setExportInfo(info);
      setExportDays(info.options[info.options.length - 1] ?? null);
    });
  }, [farmId]);

  useEffect(() => {
    if (!sensorId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getSensorSummary(farmId, sensorId, period),
      getSensorTrend(farmId, sensorId, period),
      getDailySummary(farmId, sensorId),
    ]).then(([s, t, d]) => {
      if (cancelled) return;
      setSummary(s);
      setTrend(t);
      setDaily(d);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [farmId, sensorId, period]);

  async function handleExport() {
    if (!sensorId || !exportDays) return;
    setExporting(true);
    setExportError(null);
    const res = await exportSensorHistoryCsv(farmId, sensorId, exportDays);
    setExporting(false);
    if (!res.ok) {
      setExportError(res.error);
      return;
    }
    const blob = new Blob([toUtf16LeWithBom(res.csv)], { type: "text/csv;charset=utf-16le;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = res.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (sensors.length === 0) {
    return (
      <div className="card p-10 text-center">
        <div className="text-4xl">📊</div>
        <div className="mt-3 font-semibold text-brand-800">ยังไม่มี Sensor ในฟาร์มนี้</div>
        <p className="mt-1 text-sm text-brand-900/60">เพิ่ม Sensor ให้อุปกรณ์ก่อน จึงจะดูรายงานได้</p>
      </div>
    );
  }

  const unit = summary?.unit ?? sensors.find((s) => s.id === sensorId)?.unit ?? "";

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-brand-900/60">Sensor:</span>
            <select
              value={sensorId}
              onChange={(e) => setSensorId(e.target.value)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-brand-800"
            >
              {sensors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.deviceName} — {s.name} {s.unit ? `(${s.unit})` : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="ml-auto flex items-center gap-1.5">
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
        </div>

        {exportInfo && (
          <div className="mt-3 pt-3 border-t border-border">
            <div
              className={`flex flex-wrap items-center gap-3 ${
                !exportInfo.planAllowsExport ? "opacity-40 pointer-events-none select-none" : ""
              }`}
            >
              <label className="flex items-center gap-2 text-xs text-brand-900/70">
                Export ย้อนหลัง
                <select
                  value={exportDays ?? ""}
                  onChange={(e) => setExportDays(Number(e.target.value))}
                  disabled={!exportInfo.planAllowsExport}
                  className="rounded-lg border border-border px-2 py-1 text-xs"
                >
                  {exportInfo.options.map((d) => (
                    <option key={d} value={d}>
                      {d} วัน
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={handleExport}
                disabled={!exportInfo.planAllowsExport || exporting || !exportDays || (summary?.samples ?? 0) === 0}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold px-3.5 py-2 transition"
              >
                {exporting ? "กำลังสร้างไฟล์..." : "⬇ Export CSV"}
              </button>
              {exportInfo.planAllowsExport && (summary?.samples ?? 0) === 0 && !loading && (
                <span className="text-xs text-brand-900/45">ไม่มีข้อมูลประวัติในช่วงเวลานี้</span>
              )}
              {exportError && <span className="text-xs text-red-700">{exportError}</span>}
            </div>

            {!exportInfo.planAllowsExport && (
              <div className="mt-3">
                <FeatureLockedNotice planName={exportInfo.planName} featureLabel="Export CSV" compact />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card p-6">
        <h2 className="font-bold text-brand-800 mb-3">สรุปค่า Sensor</h2>
        {loading ? (
          <div className="h-16 flex items-center justify-center text-sm text-brand-900/40">กำลังโหลด...</div>
        ) : summary && summary.samples > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
            <Stat label="ปัจจุบัน" value={summary.current} unit={unit} highlight />
            <Stat label="ต่ำสุด" value={summary.min} unit={unit} />
            <Stat label="สูงสุด" value={summary.max} unit={unit} />
            <Stat label="เฉลี่ย" value={summary.avg} unit={unit} />
            <Stat label="จำนวนตัวอย่าง" value={summary.samples} unit="" />
          </div>
        ) : (
          <p className="text-sm text-brand-900/50">
            ไม่มีข้อมูลประวัติในช่วงเวลานี้ — เปิด &quot;บันทึกประวัติ Sensor&quot; ที่หน้า Sensor ก่อน
          </p>
        )}
      </div>

      <div className="card p-6">
        <h2 className="font-bold text-brand-800 mb-3">แนวโน้ม (Trend)</h2>
        {loading ? (
          <div className="h-[180px] flex items-center justify-center text-sm text-brand-900/40">กำลังโหลด...</div>
        ) : (
          <SvgLineChart points={trend} unit={unit} />
        )}
      </div>

      <div className="card p-6">
        <h2 className="font-bold text-brand-800 mb-3">สรุปรายวัน (7 วันล่าสุด)</h2>
        {loading ? (
          <div className="h-[180px] flex items-center justify-center text-sm text-brand-900/40">กำลังโหลด...</div>
        ) : (
          <SvgBarChart data={daily} unit={unit} />
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, unit, highlight }: { label: string; value: number | null; unit: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-brand-900/50 uppercase tracking-wider">{label}</div>
      <div className={`text-lg font-bold ${highlight ? "text-brand-600" : "text-brand-800"}`}>
        {value === null ? "-" : value.toFixed(unit ? 1 : 0)}
        {unit && <span className="text-xs font-normal text-brand-900/50"> {unit}</span>}
      </div>
    </div>
  );
}
