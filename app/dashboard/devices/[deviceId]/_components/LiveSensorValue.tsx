"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Polls sensor_readings_latest every 5s for a single sensor.
 * Initial value hydrated from server via props — page renders instantly,
 * then updates without refresh. RLS still enforced (user's Supabase session).
 */
export function LiveSensorValue({
  sensorId,
  initialValue,
  initialUnit,
  initialOccurredAt,
  fallbackUnit,
  size = "sm",
}: {
  sensorId: string;
  initialValue: number | null;
  initialUnit: string | null;
  initialOccurredAt: string | null;
  fallbackUnit: string;
  size?: "sm" | "lg";
}) {
  const [value, setValue] = useState<number | null>(initialValue);
  const [unit, setUnit] = useState<string | null>(initialUnit);
  const [occurredAt, setOccurredAt] = useState<string | null>(initialOccurredAt);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function fetchLatest() {
      const { data } = await supabase
        .from("sensor_readings_latest")
        .select("value, unit, occurred_at")
        .eq("sensor_id", sensorId)
        .maybeSingle();
      if (cancelled || !data) return;
      const nextTs = data.occurred_at as string;
      // Only update state when timestamp advances (avoid re-render on same reading)
      setOccurredAt((prev) => {
        if (prev && new Date(prev).getTime() >= new Date(nextTs).getTime()) return prev;
        setValue(data.value as number);
        setUnit(data.unit as string | null);
        return nextTs;
      });
    }

    // First poll after 5s (initial value already from SSR)
    const interval = setInterval(fetchLatest, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sensorId]);

  if (value === null) {
    return (
      <div className="text-sm text-brand-900/40 italic">— ยังไม่มีข้อมูล —</div>
    );
  }

  const displayUnit = unit ?? fallbackUnit;
  const displayValue = Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const timeStr = occurredAt ? new Date(occurredAt).toLocaleTimeString("th-TH") : "";

  if (size === "lg") {
    return (
      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-extrabold text-brand-800 tabular-nums transition-all">
            {displayValue}
          </span>
          <span className="text-2xl font-semibold text-brand-700">{displayUnit}</span>
        </div>
        <div className="mt-3 text-xs text-brand-900/55">
          อัปเดตเมื่อ <span className="font-semibold text-brand-800">{timeStr}</span>
          <span className="ml-2 inline-flex items-center gap-1 text-green-700">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            live
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-extrabold text-brand-800 tabular-nums transition-all">
          {displayValue}
        </span>
        <span className="text-sm text-brand-700">{displayUnit}</span>
      </div>
      <div className="mt-1 flex items-center gap-1 text-[10px] text-brand-900/50">
        <span>{timeStr}</span>
        <span className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
      </div>
    </>
  );
}
