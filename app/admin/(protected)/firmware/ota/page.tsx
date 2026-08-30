import Link from "next/link";
import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatThaiDate } from "@/lib/payment";
import { JobActions } from "./_components/JobActions";

type JobRow = {
  id: string;
  device_id: string;
  firmware_release_id: string;
  state: string;
  progress: number | null;
  from_version: string | null;
  to_version: string;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  iot_nodes: { device_name: string | null; device_uid: string } | null;
};

const STATE_CLS: Record<string, string> = {
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

const TERMINAL = new Set(["failed", "cancelled", "timeout", "rolled_back"]);

export default async function OtaMonitoringPage() {
  await requireModule("firmware");
  const admin = createAdminClient();

  // 2-step resolve (no PostgREST embed reliance elsewhere in this repo) —
  // done here as one embed since this is an admin-only read-heavy page;
  // if it ever proves fragile, split like app/api/telemetry/ingest does.
  const { data } = await admin
    .from("firmware_update_jobs")
    .select(
      "id, device_id, firmware_release_id, state, progress, from_version, to_version, error_message, created_at, completed_at, iot_nodes(device_name, device_uid)"
    )
    .order("created_at", { ascending: false })
    .limit(100);
  const jobs = (data ?? []) as unknown as JobRow[];

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin/firmware" className="text-xs text-brand-700/70 hover:underline">
          ← Firmware Releases
        </Link>
        <h1 className="text-2xl font-bold text-brand-800 mt-1">OTA Update Monitoring</h1>
        <p className="text-sm text-brand-900/60 mt-1">
          ล่าสุด 100 job — retry ใช้ได้เมื่อ job จบแบบ terminal เท่านั้น, cancel ใช้ได้เฉพาะตอนยังไม่เริ่มเขียน flash (state = requested)
        </p>
      </div>

      {jobs.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-5xl">📡</div>
          <div className="mt-3 font-semibold text-brand-800">ยังไม่มี OTA job</div>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-50/70 border-b border-brand-100">
              <tr className="text-left text-xs font-bold uppercase tracking-wider text-brand-800/70">
                <th className="px-4 py-3">Device</th>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Progress</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Completed</th>
                <th className="px-4 py-3">Error</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-100">
              {jobs.map((j) => (
                <tr key={j.id} className="hover:bg-brand-50/50">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-brand-800">{j.iot_nodes?.device_name ?? "—"}</div>
                    <div className="text-[11px] font-mono text-brand-900/55">{j.iot_nodes?.device_uid}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-brand-900/80">
                    {j.from_version ? `V${j.from_version} → ` : ""}V{j.to_version}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${STATE_CLS[j.state] ?? "bg-brand-100 text-brand-700"}`}>
                      {j.state}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-brand-900/80">{j.progress != null ? `${j.progress}%` : "—"}</td>
                  <td className="px-4 py-3 text-xs text-brand-900/60">{formatThaiDate(j.created_at)}</td>
                  <td className="px-4 py-3 text-xs text-brand-900/60">{j.completed_at ? formatThaiDate(j.completed_at) : "—"}</td>
                  <td className="px-4 py-3 text-xs text-red-700 max-w-[200px] truncate" title={j.error_message ?? undefined}>
                    {j.error_message ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <JobActions jobId={j.id} state={j.state} canRetry={TERMINAL.has(j.state)} canCancel={j.state === "requested"} />
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
