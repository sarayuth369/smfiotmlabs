"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type DailyWeather = {
  date: string;
  temp_min_c: number;
  temp_max_c: number;
  precipitation_sum_mm: number;
  precipitation_probability_max_pct: number;
  wind_speed_max_kmh: number;
  weather_text: string;
  weather_icon: string;
  sunrise: string | null;
  sunset: string | null;
};

type WeatherResponse = {
  farm: { id: string; name: string; province: string | null; district: string | null; subdistrict: string | null; latitude: number | null; longitude: number | null };
  located: boolean;
  weather?: {
    current: {
      temperature_c: number;
      humidity_pct: number;
      precipitation_mm: number;
      wind_speed_kmh: number;
      weather_text: string;
      weather_icon: string;
      time: string;
    };
    daily: DailyWeather[];
    fetched_at: string;
    source: string;
  } | null;
  flood_risk?: { level: "normal" | "watch" | "warning"; reason: string; precipitation_24h_mm: number } | null;
  stale?: boolean;
  error?: string | null;
};

const RISK_STYLE: Record<string, { badge: string; card: string; icon: string }> = {
  normal: { badge: "bg-green-100 text-green-800", card: "border-green-200 bg-green-50/50", icon: "🌊" },
  watch: { badge: "bg-amber-100 text-amber-800", card: "border-amber-200 bg-amber-50/60", icon: "⚠️" },
  warning: { badge: "bg-red-100 text-red-800", card: "border-red-300 bg-red-50/70", icon: "🚨" },
};

export type ZoneSummary = {
  id: string;
  name: string;
  crop_type: string | null;
  planting_date: string | null;
  expected_harvest_date: string | null;
  days_to_harvest: number | null;
};

export type CropAdvisory = {
  environment_notes: string[];
  watch_items: string[];
  pest_disease_notes: string[];
  daily_actions: string[];
};

const STATUS_STYLE: Record<string, { badge: string; card: string; label: string }> = {
  good: { badge: "bg-green-100 text-green-800", card: "border-green-200", label: "🟢 ปกติ" },
  attention: { badge: "bg-amber-100 text-amber-800", card: "border-amber-200", label: "🟡 ควรเฝ้าระวัง" },
  critical: { badge: "bg-red-100 text-red-800", card: "border-red-300", label: "🔴 ควรดำเนินการ" },
};

const DAY_LABELS = ["วันนี้", "พรุ่งนี้"];

function formatDayLabel(dateStr: string, idx: number): string {
  if (idx < DAY_LABELS.length) return DAY_LABELS[idx];
  const d = new Date(dateStr);
  return d.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", weekday: "short", day: "numeric", month: "short" });
}

export function FarmWeatherSection({
  farmId,
  zone,
  status,
  cropAdvisory,
  advisoryLoading,
}: {
  farmId: string;
  zone?: ZoneSummary | null;
  status?: "good" | "attention" | "critical";
  cropAdvisory?: CropAdvisory | null;
  advisoryLoading?: boolean;
}) {
  const [data, setData] = useState<WeatherResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/ai/weather?farm_id=${farmId}`)
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? "ไม่สามารถโหลดข้อมูลสภาพอากาศได้");
          setData(null);
        } else {
          setData(json);
        }
      })
      .catch(() => {
        if (!cancelled) setError("ไม่สามารถโหลดข้อมูลสภาพอากาศได้");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [farmId]);

  if (loading) {
    return (
      <div className="card p-5">
        <div className="h-20 flex items-center justify-center text-sm text-brand-900/40">กำลังโหลดข้อมูลฟาร์ม...</div>
      </div>
    );
  }

  if (error) {
    // Weather is best-effort — never break the rest of the page.
    return (
      <div className="card p-4 border-amber-200 bg-amber-50/50">
        <p className="text-xs text-amber-900">⚠ {error}</p>
      </div>
    );
  }

  if (!data) return null;

  const loc = [data.farm.subdistrict, data.farm.district, data.farm.province].filter(Boolean).join(" • ");

  return (
    <div className="space-y-4">
      {/* Farm location header */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-bold text-brand-800">📍 {data.farm.name}</div>
            <div className="text-sm text-brand-900/60 mt-0.5">{loc || "ไม่ระบุที่ตั้ง"}</div>
            {data.located && (
              <div className="text-[11px] text-brand-900/40 font-mono mt-0.5">
                {data.farm.latitude?.toFixed(4)}, {data.farm.longitude?.toFixed(4)}
              </div>
            )}
          </div>
          {!data.located && (
            <Link
              href={`/dashboard/farms/${data.farm.id}/edit`}
              className="text-xs rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-3.5 py-2 transition"
            >
              + ตั้งพิกัดฟาร์ม
            </Link>
          )}
        </div>
        {!data.located && (
          <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ยังไม่ได้ตั้งตำแหน่งฟาร์ม — กรุณาเพิ่มพิกัดใน Farm Settings เพื่อดูสภาพอากาศและคำแนะนำตามตำแหน่งจริง
          </p>
        )}
      </div>

      {data.located && data.weather && (
        <>
          {data.stale && (
            <p className="text-[11px] text-amber-700 px-1">⚠ แสดงข้อมูลสภาพอากาศล่าสุดที่มี (เชื่อมต่อ provider ไม่สำเร็จชั่วคราว)</p>
          )}

          {/* Current weather */}
          <div className="card p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-4xl">{data.weather.current.weather_icon}</span>
                <div>
                  <div className="text-2xl font-extrabold text-brand-800">{data.weather.current.temperature_c.toFixed(1)}°C</div>
                  <div className="text-sm text-brand-900/60">{data.weather.current.weather_text}</div>
                </div>
              </div>
              <div className="text-right text-xs text-brand-900/50 space-y-0.5">
                <div>💧 {data.weather.current.humidity_pct}%</div>
                <div>💨 {data.weather.current.wind_speed_kmh.toFixed(0)} km/h</div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border text-[11px] text-brand-900/40">
              อัปเดตล่าสุด {new Date(data.weather.fetched_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })} · ข้อมูลจาก Open-Meteo
            </div>
          </div>

          {/* Today summary */}
          {data.weather.daily[0] && (
            <div className="card p-5">
              <h3 className="text-sm font-bold text-brand-800 mb-3">สรุปวันนี้</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div>
                  <div className="text-[10px] text-brand-900/50 uppercase tracking-wider">อุณหภูมิ</div>
                  <div className="text-sm font-bold text-brand-800">
                    {data.weather.daily[0].temp_min_c.toFixed(0)}–{data.weather.daily[0].temp_max_c.toFixed(0)}°C
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-brand-900/50 uppercase tracking-wider">โอกาสฝน</div>
                  <div className="text-sm font-bold text-blue-700">☔ {data.weather.daily[0].precipitation_probability_max_pct}%</div>
                </div>
                <div>
                  <div className="text-[10px] text-brand-900/50 uppercase tracking-wider">ปริมาณฝน</div>
                  <div className="text-sm font-bold text-brand-800">🌧 {data.weather.daily[0].precipitation_sum_mm.toFixed(1)} มม.</div>
                </div>
                <div>
                  <div className="text-[10px] text-brand-900/50 uppercase tracking-wider">ลม</div>
                  <div className="text-sm font-bold text-brand-800">💨 {data.weather.daily[0].wind_speed_max_kmh.toFixed(0)} km/h</div>
                </div>
              </div>
            </div>
          )}

          {/* Rain forecast strip */}
          <div className="card p-5">
            <h3 className="text-sm font-bold text-brand-800 mb-3">พยากรณ์ฝน</h3>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {data.weather.daily.map((d, i) => (
                <div key={d.date} className="shrink-0 w-24 rounded-xl border border-border p-2.5 text-center">
                  <div className="text-[11px] font-semibold text-brand-800">{formatDayLabel(d.date, i)}</div>
                  <div className="text-xl my-1">{d.weather_icon}</div>
                  <div className="text-[11px] text-blue-700 font-bold">☔{d.precipitation_probability_max_pct}%</div>
                  <div className="text-[10px] text-brand-900/50">
                    {d.temp_min_c.toFixed(0)}–{d.temp_max_c.toFixed(0)}°
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Crop-specific advisory */}
          {!zone || !zone.crop_type ? (
            <div className="card p-5">
              <h3 className="text-sm font-bold text-brand-800 mb-1">🌱 คำแนะนำเกษตรสำหรับแปลง</h3>
              <p className="text-sm text-brand-900/50">ยังไม่ได้ระบุพืชในแปลงนี้</p>
            </div>
          ) : advisoryLoading && !cropAdvisory ? (
            <div className="card p-5">
              <h3 className="text-sm font-bold text-brand-800 mb-1">🌱 คำแนะนำเกษตรสำหรับแปลง</h3>
              <div className="h-16 flex items-center justify-center text-sm text-brand-900/40">กำลังวิเคราะห์...</div>
            </div>
          ) : cropAdvisory ? (
            <div className={`card p-5 ${status ? STATUS_STYLE[status].card : "border-border"}`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-sm font-bold text-brand-800">🌱 คำแนะนำเกษตรสำหรับแปลง</h3>
                  <div className="text-xs text-brand-900/60 mt-0.5">
                    {zone.crop_type} · {zone.name}
                    {zone.days_to_harvest !== null &&
                      (zone.days_to_harvest >= 0
                        ? ` · เก็บเกี่ยวประมาณ ${zone.days_to_harvest} วัน`
                        : ` · เลยกำหนดเก็บเกี่ยว ${Math.abs(zone.days_to_harvest)} วัน`)}
                  </div>
                </div>
                {status && (
                  <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${STATUS_STYLE[status].badge}`}>
                    {STATUS_STYLE[status].label}
                  </span>
                )}
              </div>

              {cropAdvisory.environment_notes.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs font-bold text-brand-900/70 mb-1">🌡 สภาพแวดล้อม</div>
                  <ul className="space-y-1 text-sm text-brand-900/85">
                    {cropAdvisory.environment_notes.map((s, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-brand-400">•</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {cropAdvisory.watch_items.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs font-bold text-amber-800 mb-1">⚠️ สิ่งที่ควรระวัง</div>
                  <ul className="space-y-1 text-sm text-amber-900/85">
                    {cropAdvisory.watch_items.map((s, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-amber-500">•</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {cropAdvisory.pest_disease_notes.length > 0 && (
                <div className="mb-3">
                  <div className="text-xs font-bold text-brand-900/70 mb-1">🐛 โรคและแมลงที่ควรเฝ้าระวัง</div>
                  <ul className="space-y-1 text-sm text-brand-900/85">
                    {cropAdvisory.pest_disease_notes.map((s, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-brand-400">•</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[10px] text-brand-900/40">ประเมินจากสภาพอากาศ+ความรู้ทั่วไป ไม่ใช่ข่าวการระบาดจริง เว้นแต่ระบุแหล่งที่มา</p>
                </div>
              )}

              {cropAdvisory.daily_actions.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-brand-900/70 mb-1">📋 สิ่งที่ควรทำวันนี้</div>
                  <ol className="space-y-1 text-sm text-brand-900/85 list-decimal pl-4">
                    {cropAdvisory.daily_actions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          ) : null}

          {/* Flood / water risk */}
          {data.flood_risk && (
            <div className={`card p-5 ${RISK_STYLE[data.flood_risk.level].card}`}>
              <div className="flex items-center justify-between gap-3 mb-2">
                <h3 className="text-sm font-bold text-brand-800">🌊 ความเสี่ยงน้ำท่วมและน้ำ</h3>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${RISK_STYLE[data.flood_risk.level].badge}`}>
                  {data.flood_risk.level === "normal" ? "ปกติ" : data.flood_risk.level === "watch" ? "เฝ้าระวัง" : "เตือนภัย"}
                </span>
              </div>
              <p className="text-sm text-brand-900/80">{data.flood_risk.reason}</p>
              <p className="mt-2 text-[10px] text-brand-900/40">
                ประเมินจากปริมาณฝนคาดการณ์ ไม่ใช่การแจ้งเตือนน้ำท่วมอย่างเป็นทางการ
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
