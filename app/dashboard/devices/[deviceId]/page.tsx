import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatThaiDate } from "@/lib/payment";

type Device = {
  id: string;
  device_uid: string;
  device_name: string;
  farm_id: string;
  zone_id: string | null;
  device_type: string | null;
  model: string | null;
  status: "online" | "offline" | "warning";
  firmware_version: string | null;
  last_seen: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  farms: { name: string } | null;
  zones: { name: string } | null;
};

const STATUS_CLS: Record<Device["status"], string> = {
  online: "bg-green-100 text-green-800",
  offline: "bg-brand-100 text-brand-700/70",
  warning: "bg-amber-100 text-amber-800",
};

const SUBNAV = [
  { key: "overview", label: "Overview", active: true },
  { key: "sensors", label: "Sensors", soon: true },
  { key: "control", label: "Control", soon: true },
  { key: "firmware", label: "Firmware", soon: true },
  { key: "mqtt", label: "MQTT", soon: true },
];

export default async function DeviceDetailPage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  const { deviceId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS ensures user can only SELECT devices in their own farms
  const { data } = await supabase
    .from("iot_nodes")
    .select("id, device_uid, device_name, farm_id, zone_id, device_type, model, status, firmware_version, last_seen, archived_at, created_at, updated_at, farms(name), zones(name)")
    .eq("id", deviceId)
    .maybeSingle();

  // Extra ownership check (belt+suspenders) — verify parent farm belongs to user
  let owned = false;
  if (data) {
    const { data: farmCheck } = await supabase
      .from("farms")
      .select("id")
      .eq("id", (data as unknown as Device).farm_id)
      .eq("user_id", user!.id)
      .maybeSingle();
    owned = !!farmCheck;
  }
  if (!data || !owned) notFound();

  const raw = data as unknown as {
    id: string;
    device_uid: string;
    device_name: string;
    farm_id: string;
    zone_id: string | null;
    device_type: string | null;
    model: string | null;
    status: Device["status"];
    firmware_version: string | null;
    last_seen: string | null;
    archived_at: string | null;
    created_at: string;
    updated_at: string;
    farms: { name: string } | { name: string }[] | null;
    zones: { name: string } | { name: string }[] | null;
  };
  const farmName = Array.isArray(raw.farms) ? raw.farms[0]?.name ?? null : raw.farms?.name ?? null;
  const zoneName = Array.isArray(raw.zones) ? raw.zones[0]?.name ?? null : raw.zones?.name ?? null;

  const isArchived = !!raw.archived_at;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href="/dashboard/devices" className="hover:text-brand-900">← อุปกรณ์ IoT</Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-brand-800 truncate">📡 {raw.device_name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-brand-900/60">
            <span className="font-mono text-xs">{raw.device_uid}</span>
            {isArchived ? (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                Archived
              </span>
            ) : (
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${STATUS_CLS[raw.status]}`}>
                {raw.status}
              </span>
            )}
          </div>
        </div>
        <Link
          href={`/dashboard/devices/${deviceId}/edit`}
          className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 hover:border-brand-400 text-brand-800 font-semibold px-4 py-2 text-sm transition"
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          แก้ไข / Settings
        </Link>
      </div>

      {/* Sub-nav */}
      <div className="border-b border-brand-100 mb-6 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {SUBNAV.map((n) => (
            <div
              key={n.key}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap ${
                n.active ? "text-brand-800 border-b-2 border-brand-600" : "text-brand-900/40"
              }`}
              title={n.soon ? "เร็ว ๆ นี้" : undefined}
            >
              {n.label}
              {n.soon && (
                <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-50 text-brand-600 align-middle">
                  Soon
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Overview */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <div className="card p-6">
            <h2 className="font-bold text-brand-800 mb-3">ข้อมูลอุปกรณ์</h2>
            <dl className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-brand-900/55">Device UID</dt>
                <dd className="font-mono font-semibold text-brand-800 mt-0.5">{raw.device_uid}</dd>
              </div>
              <div>
                <dt className="text-xs text-brand-900/55">ชื่ออุปกรณ์</dt>
                <dd className="font-semibold text-brand-800 mt-0.5">{raw.device_name}</dd>
              </div>
              <div>
                <dt className="text-xs text-brand-900/55">ฟาร์ม</dt>
                <dd className="font-semibold text-brand-800 mt-0.5">
                  <Link href={`/dashboard/farms/${raw.farm_id}`} className="hover:text-brand-600">
                    {farmName ?? "-"}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-brand-900/55">แปลง / Zone</dt>
                <dd className="font-semibold text-brand-800 mt-0.5">
                  {raw.zone_id && zoneName ? (
                    <Link
                      href={`/dashboard/farms/${raw.farm_id}/zones/${raw.zone_id}`}
                      className="hover:text-brand-600"
                    >
                      {zoneName}
                    </Link>
                  ) : (
                    <span className="text-brand-900/50 italic">— ยังไม่ระบุแปลง —</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-brand-900/55">ประเภท</dt>
                <dd className="font-semibold text-brand-800 mt-0.5">{raw.device_type ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-xs text-brand-900/55">Model</dt>
                <dd className="font-semibold text-brand-800 mt-0.5">{raw.model ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-xs text-brand-900/55">Firmware Version</dt>
                <dd className="font-mono text-sm text-brand-800 mt-0.5">
                  {raw.firmware_version ?? "-"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-brand-900/55">Last Seen</dt>
                <dd className="font-semibold text-brand-800 mt-0.5">
                  {raw.last_seen ? formatThaiDate(raw.last_seen) : "ยังไม่เคยเชื่อมต่อ"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="card p-6">
            <h2 className="font-bold text-brand-800">MQTT Topics (เตรียมพร้อม)</h2>
            <div className="mt-3 space-y-2 text-xs font-mono text-brand-900/75">
              <div className="rounded-lg bg-brand-50/60 border border-brand-100 px-3 py-2">
                smfiot/{raw.device_uid}/telemetry
              </div>
              <div className="rounded-lg bg-brand-50/60 border border-brand-100 px-3 py-2">
                smfiot/{raw.device_uid}/status
              </div>
              <div className="rounded-lg bg-brand-50/60 border border-brand-100 px-3 py-2">
                smfiot/{raw.device_uid}/command
              </div>
            </div>
            <p className="mt-3 text-xs text-brand-900/55">
              การเชื่อมต่อ MQTT / HiveMQ / Sensor Realtime จะเปิดใช้งานในเฟสถัดไป
            </p>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="card p-5">
            <div className="text-xs text-brand-900/55">ลงทะเบียนเมื่อ</div>
            <div className="font-semibold text-brand-800">{formatThaiDate(raw.created_at)}</div>
          </div>
          <div className="card p-5">
            <div className="text-xs text-brand-900/55">แก้ไขล่าสุด</div>
            <div className="font-semibold text-brand-800">{formatThaiDate(raw.updated_at)}</div>
          </div>
          <div className="card p-5">
            <div className="text-xs text-brand-900/55">รหัสภายในระบบ</div>
            <div className="font-mono text-xs text-brand-800 break-all mt-0.5">{raw.id}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
