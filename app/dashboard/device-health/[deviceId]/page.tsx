import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatThaiDate } from "@/lib/payment";
import type { HealthIssue } from "@/lib/device-health";

const STATUS_CLS: Record<string, string> = {
  healthy: "bg-green-100 text-green-800",
  warning: "bg-amber-100 text-amber-800",
  critical: "bg-red-100 text-red-700",
  offline: "bg-brand-100 text-brand-700/70",
};
const SEVERITY_CLS: Record<string, string> = {
  info: "bg-brand-100 text-brand-700",
  warning: "bg-amber-100 text-amber-800",
  critical: "bg-red-100 text-red-700",
};

export default async function MyDeviceHealthDetailPage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  const { deviceId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Same ownership check as /dashboard/devices/[deviceId] — belt+suspenders
  // on top of RLS, not a replacement for it.
  const { data: device } = await supabase
    .from("iot_nodes")
    .select("id, device_uid, device_name, farm_id, hardware_model, archived_at, farms(name)")
    .eq("id", deviceId)
    .maybeSingle();
  if (!device) notFound();

  const { data: farmCheck } = await supabase
    .from("farms")
    .select("id")
    .eq("id", device.farm_id as string)
    .eq("user_id", user!.id)
    .maybeSingle();
  if (!farmCheck) notFound();

  const farm = Array.isArray(device.farms) ? device.farms[0] : device.farms;

  const [{ data: health }, { data: events }] = await Promise.all([
    supabase.from("device_health").select("*").eq("device_id", deviceId).maybeSingle(),
    supabase
      .from("device_health_events")
      .select("id, previous_status, new_status, event_type, severity, message, created_at")
      .eq("device_id", deviceId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const status = health?.status ?? "offline";
  const issues = (health?.issues as HealthIssue[] | null) ?? [];

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href="/dashboard/device-health" className="hover:text-brand-900">← สุขภาพอุปกรณ์ของฉัน</Link>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-1">
        <h1 className="text-2xl font-bold text-brand-800">{device.device_name}</h1>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${STATUS_CLS[status]}`}>{status}</span>
      </div>
      <p className="text-sm text-brand-900/60 mb-6 font-mono">{device.device_uid} · {farm?.name ?? "-"}</p>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card p-6 space-y-3 text-sm">
          <h2 className="font-bold text-brand-800 mb-1">สถานะปัจจุบัน</h2>
          <Row label="คะแนนสุขภาพ" value={`${health?.health_score ?? 0}/100`} />
          <Row label="Last Seen" value={health?.last_seen_at ? formatThaiDate(health.last_seen_at as string) : "ยังไม่เคยเชื่อมต่อ"} />
          <Row label="Telemetry ล่าสุด" value={health?.last_telemetry_at ? formatThaiDate(health.last_telemetry_at as string) : "-"} />
          <Row label="MQTT" value={health?.mqtt_status ?? "-"} />
          <Row label="เซนเซอร์" value={health?.sensor_status === "ok" ? "ปกติ" : health?.sensor_status === "no_sensors" ? "ไม่มีเซนเซอร์" : health?.sensor_status === "issues" ? "พบปัญหา" : "-"} />
          <Row label="Firmware" value={health?.firmware_version ? `V${health.firmware_version}` : "-"} />
          <Row label="Hardware" value={device.hardware_model ?? "-"} />
        </div>

        <div className="card p-6 lg:col-span-2">
          <h2 className="font-bold text-brand-800 mb-3">ปัญหาที่ตรวจพบ ({issues.length})</h2>
          {issues.length === 0 ? (
            <div className="text-sm text-brand-900/50">ไม่มีปัญหาที่ตรวจพบ — อุปกรณ์ทำงานปกติ</div>
          ) : (
            <div className="space-y-2">
              {issues.map((iss, i) => (
                <div key={i} className="flex items-start gap-2 text-sm border-b border-brand-50 pb-2">
                  <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${SEVERITY_CLS[iss.severity]}`}>{iss.severity}</span>
                  <div className="text-brand-800">{iss.message}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card p-6 mt-5">
        <h2 className="font-bold text-brand-800 mb-3">ประวัติสถานะ</h2>
        {!events || events.length === 0 ? (
          <div className="text-sm text-brand-900/50">ยังไม่มีประวัติ</div>
        ) : (
          <div className="space-y-2">
            {events.map((ev) => (
              <div key={ev.id as string} className="flex items-start gap-3 text-sm border-b border-brand-50 pb-2">
                <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${SEVERITY_CLS[ev.severity as string] ?? SEVERITY_CLS.info}`}>
                  {ev.severity as string}
                </span>
                <div className="flex-1 text-brand-900/70">{ev.message as string}</div>
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
