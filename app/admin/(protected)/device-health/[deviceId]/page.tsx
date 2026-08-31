import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatThaiDate } from "@/lib/payment";
import type { HealthIssue } from "@/lib/device-health";

const STATUS_CLS: Record<string, string> = {
  healthy: "bg-green-100 text-green-800",
  warning: "bg-amber-100 text-amber-800",
  critical: "bg-red-100 text-red-800",
  offline: "bg-brand-100 text-brand-700/70",
};
const SEVERITY_CLS: Record<string, string> = {
  info: "bg-brand-100 text-brand-700",
  warning: "bg-amber-100 text-amber-800",
  critical: "bg-red-100 text-red-800",
};

export default async function DeviceHealthDetailPage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  await requireModule("devices");
  const { deviceId } = await params;
  const admin = createAdminClient();

  const { data: device } = await admin
    .from("iot_nodes")
    .select("id, device_uid, device_name, farm_id, hardware_model, farms(name)")
    .eq("id", deviceId)
    .maybeSingle();
  if (!device) notFound();
  const farm = Array.isArray(device.farms) ? device.farms[0] : device.farms;

  const [{ data: health }, { data: events }] = await Promise.all([
    admin.from("device_health").select("*").eq("device_id", deviceId).maybeSingle(),
    admin.from("device_health_events").select("*").eq("device_id", deviceId).order("created_at", { ascending: false }).limit(50),
  ]);

  const status = health?.status ?? "offline";
  const issues = (health?.issues as HealthIssue[] | null) ?? [];

  return (
    <div>
      <Link href="/admin/device-health" className="text-xs text-brand-700/70 hover:underline">← Device Health</Link>
      <div className="mt-1 mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-bold text-brand-800">{device.device_name}</h1>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${STATUS_CLS[status]}`}>{status}</span>
      </div>
      <p className="text-sm text-brand-900/60 -mt-4 mb-6 font-mono">{device.device_uid} · {farm?.name ?? "-"}</p>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card p-6 space-y-3 text-sm">
          <h2 className="font-bold text-brand-800 mb-1">สถานะปัจจุบัน</h2>
          <Row label="Health Score" value={String(health?.health_score ?? 0)} />
          <Row label="Last Seen" value={health?.last_seen_at ? formatThaiDate(health.last_seen_at as string) : "ยังไม่เคยเชื่อมต่อ"} />
          <Row label="Last Telemetry" value={health?.last_telemetry_at ? formatThaiDate(health.last_telemetry_at as string) : "-"} />
          <Row label="MQTT Status" value={health?.mqtt_status ?? "-"} />
          <Row label="Sensor Status" value={health?.sensor_status ?? "-"} />
          <Row label="Firmware" value={health?.firmware_version ? `V${health.firmware_version}` : "-"} />
          <Row label="Hardware" value={device.hardware_model ?? "-"} />
          <Row label="Last Evaluated" value={health?.last_evaluated_at ? formatThaiDate(health.last_evaluated_at as string) : "-"} />
        </div>

        <div className="card p-6 lg:col-span-2">
          <h2 className="font-bold text-brand-800 mb-3">Active Issues ({issues.length})</h2>
          {issues.length === 0 ? (
            <div className="text-sm text-brand-900/50">ไม่มีปัญหาที่ตรวจพบ</div>
          ) : (
            <div className="space-y-2">
              {issues.map((iss, i) => (
                <div key={i} className="flex items-start gap-2 text-sm border-b border-brand-50 pb-2">
                  <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${SEVERITY_CLS[iss.severity]}`}>{iss.severity}</span>
                  <div>
                    <div className="font-semibold text-brand-800">{iss.type}</div>
                    <div className="text-brand-900/70 text-xs mt-0.5">{iss.message}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card p-6 mt-5">
        <h2 className="font-bold text-brand-800 mb-3">Event History</h2>
        {!events || events.length === 0 ? (
          <div className="text-sm text-brand-900/50">ยังไม่มีประวัติ</div>
        ) : (
          <div className="space-y-2">
            {events.map((ev) => (
              <div key={ev.id as string} className="flex items-start gap-3 text-sm border-b border-brand-50 pb-2">
                <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${SEVERITY_CLS[ev.severity as string] ?? SEVERITY_CLS.info}`}>
                  {ev.severity as string}
                </span>
                <div className="flex-1">
                  <div className="text-brand-800">
                    <span className="font-semibold">{ev.event_type as string}</span>
                    {ev.previous_status && <span className="text-brand-900/50"> — {ev.previous_status as string} → {ev.new_status as string}</span>}
                  </div>
                  <div className="text-brand-900/60 text-xs mt-0.5">{ev.message as string}</div>
                </div>
                <div className="text-brand-900/50 text-xs shrink-0">{formatThaiDate(ev.created_at as string)}</div>
              </div>
            ))}
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
