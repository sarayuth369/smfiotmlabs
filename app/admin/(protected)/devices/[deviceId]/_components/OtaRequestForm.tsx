"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminRequestOtaUpdate } from "../../../firmware/ota/actions";

type Release = { id: string; version: string; release_channel: string };

export function OtaRequestForm({ deviceId, releases }: { deviceId: string; releases: Release[] }) {
  const router = useRouter();
  const [releaseId, setReleaseId] = useState(releases[0]?.id ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (releases.length === 0) {
    return <div className="text-xs text-brand-900/50">ไม่มี firmware release ที่อนุมัติแล้วสำหรับ hardware model นี้</div>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={releaseId}
        onChange={(e) => setReleaseId(e.target.value)}
        className="rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
      >
        {releases.map((r) => (
          <option key={r.id} value={r.id}>
            V{r.version} ({r.release_channel})
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending || !releaseId}
        onClick={() => {
          if (!confirm(`สั่งอัปเดต firmware อุปกรณ์นี้เป็น V${releases.find((r) => r.id === releaseId)?.version} หรือไม่?`)) return;
          setMsg(null);
          start(async () => {
            const r = await adminRequestOtaUpdate(deviceId, releaseId);
            setMsg(r.ok ? { ok: true, text: `ส่งคำสั่งอัปเดต firmware แล้ว (job ${r.job_id?.slice(0, 8)})` } : { ok: false, text: r.error ?? "failed" });
            router.refresh();
          });
        }}
        className="rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold px-4 py-2 text-sm transition"
      >
        {pending ? "กำลังส่ง..." : "Update Firmware"}
      </button>
      {msg && (
        <div className={`text-xs w-full ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</div>
      )}
    </div>
  );
}
