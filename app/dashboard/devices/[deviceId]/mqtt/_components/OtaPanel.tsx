"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  checkOtaAvailability,
  requestOtaUpdate,
  cancelOtaJob,
  getLatestOtaJob,
  type OtaJobRow,
} from "../../ota-actions";

type Eligibility = Awaited<ReturnType<typeof checkOtaAvailability>>;

const ACTIVE_STATES = new Set(["requested", "downloading", "verifying", "installing", "rebooting", "health_check"]);

const STATE_LABEL: Record<string, string> = {
  requested: "ส่งคำสั่งอัปเดตแล้ว รอบอร์ดตอบรับ",
  downloading: "กำลังดาวน์โหลด",
  verifying: "กำลังตรวจสอบไฟล์ (SHA256)",
  installing: "กำลังติดตั้ง",
  rebooting: "กำลังรีสตาร์ท",
  health_check: "กำลังตรวจสอบว่าเฟิร์มแวร์ใหม่ทำงานปกติ",
  success: "อัปเดตสำเร็จ",
  failed: "อัปเดตล้มเหลว",
  rolled_back: "ล้มเหลว — บอร์ดย้อนกลับไปเฟิร์มแวร์เดิมอัตโนมัติ",
  cancelled: "ยกเลิกแล้ว",
  timeout: "หมดเวลา",
};

export function OtaPanel({ deviceId, currentFirmwareVersion }: { deviceId: string; currentFirmwareVersion: string | null }) {
  const [loading, setLoading] = useState(true);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [job, setJob] = useState<OtaJobRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const [elig, latestJob] = await Promise.all([checkOtaAvailability(deviceId), getLatestOtaJob(deviceId)]);
    setEligibility(elig);
    setJob(latestJob);
    setLoading(false);
  }, [deviceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll every 4s while a job is actively in flight — stop once terminal.
  useEffect(() => {
    if (job && ACTIVE_STATES.has(job.state)) {
      pollRef.current = setInterval(refresh, 4000);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [job, refresh]);

  const handleUpdate = async () => {
    setBusy(true);
    setError(null);
    const res = await requestOtaUpdate(deviceId);
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    await refresh();
    setBusy(false);
  };

  const handleCancel = async () => {
    if (!job) return;
    setBusy(true);
    const res = await cancelOtaJob(job.id);
    if (!res.ok) setError(res.error ?? "cancel failed");
    await refresh();
    setBusy(false);
  };

  if (loading) {
    return (
      <div className="card p-6">
        <h2 className="font-bold text-brand-800">Firmware Update (OTA)</h2>
        <p className="text-sm text-brand-900/50 mt-2">กำลังตรวจสอบ…</p>
      </div>
    );
  }

  const jobActive = job && ACTIVE_STATES.has(job.state);

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-brand-800">Firmware Update (OTA)</h2>
        {job && (
          <span
            className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
              job.state === "success"
                ? "bg-green-100 text-green-800"
                : job.state === "failed" || job.state === "rolled_back" || job.state === "timeout"
                ? "bg-red-100 text-red-800"
                : job.state === "cancelled"
                ? "bg-brand-100 text-brand-700/60"
                : "bg-blue-100 text-blue-800"
            }`}
          >
            {job.state}
          </span>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-brand-900/55">เฟิร์มแวร์ปัจจุบัน</div>
          <div className="font-mono text-sm text-brand-800 mt-0.5">
            {currentFirmwareVersion ? `V${currentFirmwareVersion}` : "-"}
          </div>
        </div>
        <div>
          <div className="text-xs text-brand-900/55">เวอร์ชันล่าสุดที่มี</div>
          <div className="font-mono text-sm text-brand-800 mt-0.5">
            {eligibility?.eligible
              ? `V${eligibility.release.version}`
              : eligibility?.latest_release
              ? `V${eligibility.latest_release.version} (ล่าสุดแล้ว)`
              : "-"}
          </div>
        </div>
      </div>

      {jobActive && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-blue-800">{STATE_LABEL[job!.state] ?? job!.state}</div>
            {job!.progress != null && (
              <div className="text-sm font-bold text-blue-800 tabular-nums">{job!.progress}%</div>
            )}
          </div>
          {job!.progress != null && (
            <div className="mt-2 h-2 rounded-full bg-blue-100 overflow-hidden">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${job!.progress}%` }} />
            </div>
          )}
          <p className="mt-2 text-xs text-blue-700/80">
            บอร์ดจะรีสตาร์ทเองเมื่อทำเสร็จ — ห้ามตัดไฟระหว่างขั้นตอนนี้
          </p>
          {job!.state === "requested" && (
            <button
              onClick={handleCancel}
              disabled={busy}
              className="mt-3 text-[11px] rounded-full border border-blue-300 text-blue-800 font-semibold px-3 py-1 disabled:opacity-40"
            >
              ยกเลิก
            </button>
          )}
        </div>
      )}

      {!jobActive && job && (job.state === "failed" || job.state === "rolled_back" || job.state === "timeout") && (
        <div className="rounded-xl border border-red-200 bg-red-50/60 p-3 text-sm text-red-800">
          {STATE_LABEL[job.state]}
          {job.error_message && <div className="mt-1 text-xs font-mono text-red-700/80">{job.error_message}</div>}
        </div>
      )}

      {!jobActive && eligibility && !eligibility.eligible && eligibility.reason === "plan_no_ota" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <div className="text-sm font-semibold text-amber-800">แพ็กเกจปัจจุบันไม่รวมสิทธิ์ OTA</div>
          <p className="mt-1 text-xs text-amber-700/80">อัปเกรดแพ็กเกจเพื่อปลดล็อกการอัปเดตเฟิร์มแวร์ผ่านเครือข่าย</p>
          <Link href="/pricing" className="mt-2 inline-block text-xs font-bold text-amber-900 hover:underline">
            ดูแพ็กเกจ →
          </Link>
        </div>
      )}

      {!jobActive && eligibility && !eligibility.eligible && eligibility.reason === "no_hardware_model" && (
        <p className="text-sm text-brand-900/60">อุปกรณ์นี้ยังไม่รองรับ OTA (ไม่พบข้อมูลรุ่นฮาร์ดแวร์)</p>
      )}
      {!jobActive && eligibility && !eligibility.eligible && (eligibility.reason === "no_release" || eligibility.reason === "no_eligible_release") && (
        <p className="text-sm text-brand-900/60">ยังไม่มีเฟิร์มแวร์ที่พร้อมอัปเดตสำหรับอุปกรณ์นี้</p>
      )}
      {!jobActive && eligibility && !eligibility.eligible && eligibility.reason === "up_to_date" && (
        <p className="text-sm text-green-700 font-semibold">เฟิร์มแวร์เป็นเวอร์ชันล่าสุดแล้ว</p>
      )}

      {eligibility?.eligible && eligibility.release.release_notes && (
        <div className="rounded-xl border border-brand-100 p-3 text-sm text-brand-900/80">
          <div className="text-xs font-bold text-brand-800/80 mb-1">มีอะไรใหม่</div>
          {eligibility.release.release_notes}
          {eligibility.release.sensor_types.length > 0 && (
            <div className="mt-2 text-xs text-brand-900/60">
              รองรับเซนเซอร์เพิ่ม: {eligibility.release.sensor_types.join(", ")}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          onClick={refresh}
          disabled={busy || !!jobActive}
          className="rounded-full border border-brand-200 hover:border-brand-400 text-brand-800 font-semibold px-5 py-2.5 text-sm disabled:opacity-40"
        >
          ตรวจสอบอัปเดต
        </button>
        {eligibility?.eligible && !jobActive && (
          <button
            onClick={handleUpdate}
            disabled={busy}
            className="rounded-full bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white font-semibold px-6 py-2.5 text-sm"
          >
            {busy ? "กำลังส่งคำสั่ง…" : "อัปเดตเฟิร์มแวร์"}
          </button>
        )}
      </div>
    </div>
  );
}
