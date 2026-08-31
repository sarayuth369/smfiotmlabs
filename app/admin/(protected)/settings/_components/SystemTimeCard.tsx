"use client";

import { useEffect, useState } from "react";

function fmt(date: Date, tz: string) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: tz,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function SystemTimeCard() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2">
        <div className="text-2xl">🕒</div>
        <div className="font-bold text-brand-800">เวลาของระบบ</div>
      </div>

      <div className="mt-4 grid sm:grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-brand-900/55">เวลา Server ดิบ (UTC)</div>
          <div className="mt-1 font-mono font-semibold text-brand-800 tabular-nums">
            {now ? fmt(now, "UTC") : "…"}
          </div>
        </div>
        <div>
          <div className="text-xs text-brand-900/55 flex flex-wrap items-center gap-1.5">
            เวลาไทย (Asia/Bangkok)
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">
              ✓ ใช้งานทั่วทั้งระบบ
            </span>
          </div>
          <div className="mt-1 font-mono font-semibold text-brand-800 tabular-nums">
            {now ? fmt(now, "Asia/Bangkok") : "…"}
          </div>
        </div>
      </div>
    </div>
  );
}
