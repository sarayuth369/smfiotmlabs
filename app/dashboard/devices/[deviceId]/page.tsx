import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatThaiDate } from "@/lib/payment";
import { canCreateSensor } from "@/lib/plan-limits";
import { sensorTypeIcon, sensorTypeLabel } from "@/lib/sensor-types";

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
  { key: "sensors", label: "Sensors" }, // now live — anchor to #sensors section
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

  // Fetch sensors + plan check in parallel
  const [{ data: sensorsData }, sensorCheck, archivedSensorRes] = await Promise.all([
    supabase
      .from("sensors")
      .select("id, name, sensor_type, unit, channel, status, archived_at")
      .eq("device_id", deviceId)
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    canCreateSensor(supabase, user!.id),
    supabase
      .from("sensors")
      .select("id", { count: "exact", head: true })
      .eq("device_id", deviceId)
      .not("archived_at", "is", null),
  ]);
  const sensors = (sensorsData ?? []) as {
    id: string;
    name: string;
    sensor_type: string;
    unit: string | null;
    channel: string | null;
    status: "active" | "inactive";
  }[];
  const archivedSensorCount = archivedSensorRes.count ?? 0;

  // Fetch latest readings for all sensors in one query (Phase 11 cache)
  const sensorIds = sensors.map((s) => s.id);
  const { data: latestRows } = sensorIds.length > 0
    ? await supabase
        .from("sensor_readings_latest")
        .select("sensor_id, value, unit, occurred_at")
        .in("sensor_id", sensorIds)
    : { data: [] };
  const latestBySensor = new Map<string, { value: number; unit: string | null; occurred_at: string }>(
    (latestRows ?? []).map((r) => [
      r.sensor_id as string,
      { value: r.value as number, unit: r.unit as string | null, occurred_at: r.occurred_at as string },
    ])
  );

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
          {SUBNAV.map((n) => {
            const isLink = n.key === "sensors";
            const cls = `px-4 py-2.5 text-sm font-medium whitespace-nowrap ${
              n.active
                ? "text-brand-800 border-b-2 border-brand-600"
                : isLink
                  ? "text-brand-800 hover:text-brand-600"
                  : "text-brand-900/40"
            }`;
            const content = (
              <>
                {n.label}
                {n.soon && (
                  <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-50 text-brand-600 align-middle">
                    Soon
                  </span>
                )}
              </>
            );
            return isLink ? (
              <a key={n.key} href="#sensors" className={cls}>
                {content}
              </a>
            ) : (
              <div key={n.key} className={cls} title={n.soon ? "เร็ว ๆ นี้" : undefined}>
                {content}
              </div>
            );
          })}
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
            <h2 className="font-bold text-brand-800">ค่า Sensor ล่าสุด</h2>
            {sensors.length === 0 ? (
              <p className="mt-3 text-sm text-brand-900/55">ยังไม่มี Sensor — เพิ่มด้านล่าง</p>
            ) : (
              <div className="mt-3 grid sm:grid-cols-2 gap-3">
                {sensors.map((s) => {
                  const latest = latestBySensor.get(s.id);
                  return (
                    <div key={s.id} className="rounded-xl border border-brand-100 bg-brand-50/40 p-4">
                      <div className="text-xs font-semibold text-brand-900/60">
                        {sensorTypeIcon(s.sensor_type)} {sensorTypeLabel(s.sensor_type)}
                        {s.channel && <span className="ml-1 font-mono text-[10px]">Ch:{s.channel}</span>}
                      </div>
                      {latest ? (
                        <>
                          <div className="mt-1 flex items-baseline gap-1">
                            <span className="text-2xl font-extrabold text-brand-800">
                              {Number(latest.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-sm text-brand-700">
                              {latest.unit ?? s.unit ?? ""}
                            </span>
                          </div>
                          <div className="mt-1 text-[10px] text-brand-900/50">
                            {new Date(latest.occurred_at).toLocaleTimeString("th-TH")}
                          </div>
                        </>
                      ) : (
                        <div className="mt-1 text-sm text-brand-900/40 italic">— ยังไม่มีข้อมูล —</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-3 text-xs text-brand-900/55">
              รีเฟรชหน้าเพื่อดูค่าล่าสุด — MQTT topic pattern: <code className="font-mono text-brand-700">farm/{"{type}"}</code>
            </p>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="card p-5">
            <div className="text-xs text-brand-900/55 mb-2">Sensor Usage (บัญชี)</div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold text-brand-800">
                {sensorCheck.current.toLocaleString()}
              </span>
              <span className="text-sm text-brand-900/60">
                / {sensorCheck.limit === null ? "ไม่จำกัด" : sensorCheck.limit.toLocaleString()}
              </span>
            </div>
            <div className="mt-1 text-xs text-brand-900/50 uppercase">
              แพ็กเกจ {sensorCheck.planName}
            </div>
          </div>
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

      {/* Sensors section */}
      <section id="sensors" className="mt-8 card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-bold text-brand-800">
              Sensors{" "}
              <span className="text-sm font-normal text-brand-900/55">
                ({sensors.length} active{archivedSensorCount > 0 && ` • ${archivedSensorCount} archived`})
              </span>
            </h2>
            <p className="text-xs text-brand-900/55 mt-0.5">
              Sensor ที่ผูกกับอุปกรณ์นี้
            </p>
          </div>
          {isArchived ? (
            <div className="text-xs text-brand-900/50">อุปกรณ์เก็บถาวรอยู่ — กู้คืนก่อนเพิ่ม Sensor</div>
          ) : sensorCheck.ok ? (
            <Link
              href={`/dashboard/devices/${deviceId}/sensors/new`}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-4 py-2 transition"
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              เพิ่ม Sensor
            </Link>
          ) : (
            <div
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 text-brand-700/60 text-xs font-semibold px-4 py-2 cursor-not-allowed"
              title={sensorCheck.reason}
            >
              + เพิ่ม Sensor
            </div>
          )}
        </div>

        {sensors.length === 0 ? (
          <div className="rounded-xl border border-dashed border-brand-200 p-8 text-center">
            <div className="text-4xl">📊</div>
            <div className="mt-2 font-semibold text-brand-800">ยังไม่มี Sensor</div>
            <p className="mt-1 text-sm text-brand-900/60">
              เพิ่ม Sensor เพื่อเตรียมเชื่อมต่อข้อมูลจากอุปกรณ์
            </p>
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-3">
            {sensors.map((s) => (
              <li
                key={s.id}
                className="rounded-xl border border-border p-4 hover:border-brand-300 transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-brand-800 truncate">
                      {sensorTypeIcon(s.sensor_type)} {s.name}
                    </div>
                    <div className="text-xs text-brand-900/55 mt-0.5">
                      {sensorTypeLabel(s.sensor_type)}
                      {s.unit && ` • ${s.unit}`}
                      {s.channel && ` • Ch: ${s.channel}`}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      s.status === "active"
                        ? "bg-green-100 text-green-800"
                        : "bg-brand-100 text-brand-700/70"
                    }`}
                  >
                    {s.status}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/dashboard/devices/${deviceId}/sensors/${s.id}`}
                    className="text-xs rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-3 py-1.5 transition"
                  >
                    เปิด
                  </Link>
                  <Link
                    href={`/dashboard/devices/${deviceId}/sensors/${s.id}/edit`}
                    className="text-xs rounded-full border border-brand-200 hover:border-brand-400 text-brand-800 font-semibold px-3 py-1.5 transition"
                  >
                    ตั้งค่า
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
