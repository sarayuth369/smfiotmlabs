import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatThaiDate } from "@/lib/payment";

type FirmwareRow = {
  id: string;
  version: string;
  board: string;
  hardware_model: string;
  release_channel: "test" | "stable" | "deprecated" | "revoked";
  is_latest: boolean;
  file_size: number;
  sha256_app: string;
  approved_at: string | null;
  release_notes: string | null;
  created_at: string;
};

const CHANNEL_CLS: Record<FirmwareRow["release_channel"], string> = {
  test: "bg-amber-100 text-amber-800",
  stable: "bg-green-100 text-green-800",
  deprecated: "bg-brand-100 text-brand-700/60",
  revoked: "bg-red-100 text-red-800",
};

export default async function AdminFirmwarePage() {
  await requireModule("firmware");

  const admin = createAdminClient();
  const { data } = await admin
    .from("firmware_releases")
    .select("id, version, board, hardware_model, release_channel, is_latest, file_size, sha256_app, approved_at, release_notes, created_at")
    .order("created_at", { ascending: false });
  const releases = (data ?? []) as FirmwareRow[];

  return (
    <div>
      <div className="mb-6">
        <div className="text-xs text-brand-700/70 font-medium">การจัดการ</div>
        <h1 className="text-2xl font-bold text-brand-800">Firmware Releases</h1>
        <p className="text-sm text-brand-900/60 mt-1">
          จัดการ firmware สำหรับ ESP32 — สร้าง release / อนุมัติ / ตั้ง latest
        </p>
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-900">
          <strong>Phase 5.0 (POC):</strong> การ upload artifact + Web USB flasher UI จะเปิดใน Phase 5.1 — ตอนนี้ dashboard แสดง release ที่ insert ผ่าน SQL หรือ server action เท่านั้น
        </div>
      </div>

      {releases.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-5xl">📦</div>
          <div className="mt-3 font-semibold text-brand-800">ยังไม่มี Firmware Release</div>
          <p className="mt-1 text-sm text-brand-900/60">
            สร้าง release แรกผ่าน SQL Editor ตาม instruction ใน docs/esp32-firmware-management.md
          </p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-50/70 border-b border-brand-100">
              <tr className="text-left text-xs font-bold uppercase tracking-wider text-brand-800/70">
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Hardware</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">SHA256</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-100">
              {releases.map((r) => (
                <tr key={r.id} className="hover:bg-brand-50/50">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-brand-800">v{r.version}</div>
                    {r.is_latest && (
                      <div className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-600 text-white inline-block mt-1">
                        LATEST
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-brand-900/80">{r.board}</div>
                    <div className="text-[11px] text-brand-900/55">{r.hardware_model}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${CHANNEL_CLS[r.release_channel]}`}>
                      {r.release_channel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-brand-900/80">
                    {(r.file_size / 1024).toFixed(1)} KB
                  </td>
                  <td className="px-4 py-3">
                    <code className="font-mono text-[10px] text-brand-900/70">
                      {r.sha256_app.slice(0, 12)}…
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    {r.approved_at ? (
                      <span className="text-xs text-green-700 font-semibold">✓ Approved</span>
                    ) : (
                      <span className="text-xs text-amber-700 font-semibold">Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-brand-900/60">
                    {formatThaiDate(r.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
