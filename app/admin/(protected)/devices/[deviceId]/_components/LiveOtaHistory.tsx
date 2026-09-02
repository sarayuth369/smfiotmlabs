"use client";

import { useEffect, useRef, useState } from "react";

export type OtaJob = {
  id: string;
  state: string;
  progress: number | null;
  from_version: string | null;
  to_version: string;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

const JOB_STATE_CLS: Record<string, string> = {
  requested: "bg-brand-100 text-brand-700",
  downloading: "bg-blue-100 text-blue-800",
  verifying: "bg-blue-100 text-blue-800",
  installing: "bg-blue-100 text-blue-800",
  rebooting: "bg-blue-100 text-blue-800",
  health_check: "bg-blue-100 text-blue-800",
  success: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  rolled_back: "bg-red-100 text-red-800",
  cancelled: "bg-brand-100 text-brand-700/60",
  timeout: "bg-red-100 text-red-800",
};

const TERMINAL = new Set(["success", "failed", "cancelled", "timeout", "rolled_back"]);

function formatThai(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function LiveOtaHistory({ deviceId, initialJobs }: { deviceId: string; initialJobs: OtaJob[] }) {
  const [jobs, setJobs] = useState(initialJobs);
  const jobsRef = useRef(jobs);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function poll() {
      // Stop as soon as every known job is terminal — no point polling a
      // device that isn't mid-update.
      if (jobsRef.current.length > 0 && jobsRef.current.every((j) => TERMINAL.has(j.state))) {
        if (interval) clearInterval(interval);
        return;
      }
      const res = await fetch(`/api/admin/devices/${deviceId}/ota-jobs`, { cache: "no-store" });
      if (cancelled || !res.ok) return;
      const j = await res.json();
      if (!j.ok) return;
      setJobs(j.jobs);
    }

    interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [deviceId]);

  if (jobs.length === 0) return null;

  return (
    <div className="mt-4 border-t border-brand-100 pt-4">
      <div className="text-xs font-bold uppercase tracking-wider text-brand-900/60 mb-2">ประวัติ OTA (ล่าสุด 10)</div>
      <div className="space-y-1.5">
        {jobs.map((j) => (
          <div key={j.id} className="flex items-center gap-2 text-xs">
            <span className={`shrink-0 font-bold uppercase px-2 py-0.5 rounded-full ${JOB_STATE_CLS[j.state] ?? "bg-brand-100 text-brand-700"}`}>
              {j.state}
            </span>
            <span className="font-mono text-brand-900/80">
              {j.from_version ? `V${j.from_version} → ` : ""}V{j.to_version}
            </span>
            {j.progress != null && (
              <span className="flex items-center gap-1.5 shrink-0">
                <span className="w-16 h-1.5 rounded-full bg-brand-100 overflow-hidden">
                  <span
                    className={`block h-full rounded-full transition-all ${
                      j.state === "success"
                        ? "bg-green-500"
                        : j.state === "failed" || j.state === "timeout" || j.state === "rolled_back"
                          ? "bg-red-500"
                          : "bg-blue-500"
                    }`}
                    style={{ width: `${j.progress}%` }}
                  />
                </span>
                <span className="text-brand-900/50 tabular-nums">{j.progress}%</span>
              </span>
            )}
            <span className="ml-auto text-brand-900/50">{formatThai(j.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
