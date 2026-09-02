import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatThaiDateTime } from "@/lib/payment";
import { effectiveCommandStatus, ADMIN_COMMAND_LABEL, type AdminCommandType } from "@/lib/device-commands";
import { RemoteCommandPanel } from "./_components/RemoteCommandPanel";
import { OtaRequestForm } from "./_components/OtaRequestForm";

const STATUS_CLS: Record<string, string> = {
  online: "bg-green-100 text-green-800",
  offline: "bg-brand-100 text-brand-700/70",
  warning: "bg-amber-100 text-amber-800",
};

const CMD_STATUS_CLS: Record<string, string> = {
  pending: "bg-brand-100 text-brand-700",
  sent: "bg-blue-100 text-blue-800",
  acknowledged: "bg-blue-100 text-blue-800",
  running: "bg-blue-100 text-blue-800",
  success: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  timeout: "bg-red-100 text-red-800",
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

export default async function AdminDeviceDetailPage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  await requireModule("devices");
  const { deviceId } = await params;
  const admin = createAdminClient();

  const { data: device } = await admin
    .from("iot_nodes")
    .select(
      "id, device_uid, device_name, farm_id, status, firmware_version, hardware_model, rssi, is_disabled, archived_at, last_seen, created_at"
    )
    .eq("id", deviceId)
    .maybeSingle();
  if (!device) notFound();

  const [{ data: farm }, { data: health }, { data: commandsRaw }, { data: jobsRaw }, { data: releasesRaw }] =
    await Promise.all([
      admin.from("farms").select("name, user_id").eq("id", device.farm_id as string).maybeSingle(),
      admin.from("device_health").select("status, health_score, last_seen_at, issues").eq("device_id", deviceId).maybeSingle(),
      admin
        .from("device_commands")
        .select("id, command, status, requested_by, user_id, payload, result, error_message, requested_at, sent_at, acknowledged_at, completed_at")
        .eq("device_id", deviceId)
        .order("requested_at", { ascending: false })
        .limit(20),
      admin
        .from("firmware_update_jobs")
        .select("id, state, progress, from_version, to_version, error_message, created_at, completed_at")
        .eq("device_id", deviceId)
        .order("created_at", { ascending: false })
        .limit(10),
      device.hardware_model
        ? admin
            .from("firmware_releases")
            .select("id, version, release_channel")
            .in("hardware_model", [device.hardware_model as string, "ESP32-S3"])
            .not("approved_at", "is", null)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);

  const ownerEmail = farm?.user_id
    ? (await admin.from("profiles").select("email").eq("id", farm.user_id as string).maybeSingle()).data?.email ?? null
    : null;

  const commands = commandsRaw ?? [];
  const jobs = jobsRaw ?? [];
  const releases = releasesRaw ?? [];

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href="/admin/devices" className="hover:text-brand-900">← IoT Devices</Link>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-1">
        <h1 className="text-2xl font-bold text-brand-800">{device.device_name}</h1>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${STATUS_CLS[device.status as string] ?? "bg-brand-100 text-brand-700"}`}>
          {device.status}
        </span>
        {health?.status && (
          <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-100">
            Health: {health.status}
          </span>
        )}
      </div>
      <p className="text-sm text-brand-900/60 mb-6 font-mono">
        {device.device_uid} · {farm?.name ?? "-"} · {ownerEmail ?? "-"}
      </p>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card p-6 space-y-3 text-sm">
          <h2 className="font-bold text-brand-800 mb-1">ข้อมูลอุปกรณ์</h2>
          <Row label="Firmware" value={device.firmware_version ? `V${device.firmware_version}` : "-"} />
          <Row label="Hardware" value={(device.hardware_model as string | null) ?? "-"} />
          <Row label="WiFi RSSI" value={device.rssi != null ? `${device.rssi} dBm` : "-"} />
          <Row label="Last Seen" value={device.last_seen ? formatThaiDateTime(device.last_seen as string) : "ยังไม่เคยเชื่อมต่อ"} />
          <Row label="Disabled" value={device.is_disabled ? "ใช่" : "ไม่"} />
        </div>

        <div className="card p-6 lg:col-span-2">
          <h2 className="font-bold text-brand-800 mb-3">Remote Management</h2>
          <RemoteCommandPanel deviceId={deviceId} />
        </div>
      </div>

      <div className="card p-6 mt-5">
        <h2 className="font-bold text-brand-800 mb-1">Firmware</h2>
        <p className="text-xs text-brand-900/55 mb-3">
          ปัจจุบัน V{device.firmware_version ?? "-"} — เลือก release ที่อนุมัติแล้วสำหรับ {(device.hardware_model as string | null) ?? "hardware model นี้"}
        </p>
        <OtaRequestForm deviceId={deviceId} releases={releases as { id: string; version: string; release_channel: string }[]} />

        {jobs.length > 0 && (
          <div className="mt-4 border-t border-brand-100 pt-4">
            <div className="text-xs font-bold uppercase tracking-wider text-brand-900/60 mb-2">ประวัติ OTA (ล่าสุด 10)</div>
            <div className="space-y-1.5">
              {jobs.map((j) => (
                <div key={j.id} className="flex items-center gap-2 text-xs">
                  <span className={`shrink-0 font-bold uppercase px-2 py-0.5 rounded-full ${JOB_STATE_CLS[j.state as string] ?? "bg-brand-100 text-brand-700"}`}>
                    {j.state}
                  </span>
                  <span className="font-mono text-brand-900/80">
                    {j.from_version ? `V${j.from_version} → ` : ""}V{j.to_version}
                  </span>
                  {j.progress != null && <span className="text-brand-900/50">{j.progress}%</span>}
                  <span className="ml-auto text-brand-900/50">{formatThaiDateTime(j.created_at as string)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card p-6 mt-5">
        <h2 className="font-bold text-brand-800 mb-3">Command History (ล่าสุด 20)</h2>
        {commands.length === 0 ? (
          <div className="text-sm text-brand-900/50">ยังไม่มีคำสั่งที่ส่งไปยังอุปกรณ์นี้</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-brand-800/70 border-b border-brand-100">
                  <th className="py-2 pr-3">Command</th>
                  <th className="py-2 pr-3">Requested By</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Requested</th>
                  <th className="py-2 pr-3">Completed</th>
                  <th className="py-2 pr-3">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-50">
                {commands.map((c) => {
                  const status = effectiveCommandStatus(c.command as string, c.status as string, c.requested_at as string);
                  const label = ADMIN_COMMAND_LABEL[c.command as AdminCommandType] ?? (c.command as string);
                  return (
                    <tr key={c.id as string}>
                      <td className="py-2 pr-3 font-semibold text-brand-800">{label}</td>
                      <td className="py-2 pr-3 text-brand-900/70">{(c.requested_by as string | null) ?? (c.user_id ? "user" : "-")}</td>
                      <td className="py-2 pr-3">
                        <span className={`font-bold uppercase px-2 py-0.5 rounded-full ${CMD_STATUS_CLS[status] ?? "bg-brand-100 text-brand-700"}`}>
                          {status}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-brand-900/60">{formatThaiDateTime(c.requested_at as string)}</td>
                      <td className="py-2 pr-3 text-brand-900/60">{c.completed_at ? formatThaiDateTime(c.completed_at as string) : "-"}</td>
                      <td className="py-2 pr-3 text-brand-900/70 max-w-[320px]">
                        {c.error_message ? (
                          <span className="text-red-700">{c.error_message as string}</span>
                        ) : c.result ? (
                          <details>
                            <summary className="cursor-pointer text-brand-700 hover:underline">ดูผลลัพธ์</summary>
                            <pre className="mt-1 whitespace-pre-wrap break-all text-[10px] bg-brand-50/60 rounded-lg p-2">
                              {JSON.stringify(c.result, null, 2)}
                            </pre>
                          </details>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-brand-900/55">{label}</span>
      <span className="font-semibold text-brand-800">{value}</span>
    </div>
  );
}
