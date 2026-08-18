import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatThaiDate } from "@/lib/payment";
import { SENSOR_TYPES, isValidSensorType, sensorTypeLabel, sensorTypeIcon } from "@/lib/sensor-types";
import { LiveSensorValue } from "../../_components/LiveSensorValue";

export default async function SensorDetailPage({
  params,
}: {
  params: Promise<{ deviceId: string; sensorId: string }>;
}) {
  const { deviceId, sensorId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("sensors")
    .select("id, device_id, name, sensor_type, unit, description, channel, status, archived_at, created_at, updated_at, iot_nodes!inner(id, device_uid, device_name, farm_id, zone_id, farms!inner(id, user_id, name), zones(id, name))")
    .eq("id", sensorId)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (!data) notFound();

  // Fetch latest reading (Phase 11 sensor_readings_latest cache — O(1) lookup)
  const { data: latestRow } = await supabase
    .from("sensor_readings_latest")
    .select("value, unit, occurred_at, received_at")
    .eq("sensor_id", sensorId)
    .maybeSingle();

  const raw = data as unknown as {
    id: string;
    device_id: string;
    name: string;
    sensor_type: string;
    unit: string | null;
    description: string | null;
    channel: string | null;
    status: "active" | "inactive";
    archived_at: string | null;
    created_at: string;
    updated_at: string;
    iot_nodes: {
      id: string;
      device_uid: string;
      device_name: string;
      farm_id: string;
      zone_id: string | null;
      farms: { id: string; user_id: string; name: string } | { id: string; user_id: string; name: string }[];
      zones: { id: string; name: string } | { id: string; name: string }[] | null;
    } | Array<{
      id: string;
      device_uid: string;
      device_name: string;
      farm_id: string;
      zone_id: string | null;
      farms: { id: string; user_id: string; name: string } | { id: string; user_id: string; name: string }[];
      zones: { id: string; name: string } | { id: string; name: string }[] | null;
    }>;
  };
  const device = Array.isArray(raw.iot_nodes) ? raw.iot_nodes[0] : raw.iot_nodes;
  if (!device) notFound();
  const farm = Array.isArray(device.farms) ? device.farms[0] : device.farms;
  if (!farm || farm.user_id !== user!.id) notFound();
  const zone = Array.isArray(device.zones) ? device.zones[0] : device.zones;

  const isArchived = !!raw.archived_at;
  const typeIcon = sensorTypeIcon(raw.sensor_type);
  const typeLabel = sensorTypeLabel(raw.sensor_type);
  const unit = raw.unit ?? (isValidSensorType(raw.sensor_type) ? SENSOR_TYPES[raw.sensor_type].unit : "-");

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href={`/dashboard/devices/${deviceId}`} className="hover:text-brand-900">
          ← {device.device_name}
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-brand-800 truncate">
            {typeIcon} {raw.name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-brand-900/60">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-brand-100 text-brand-700">
              {typeLabel}
            </span>
            <span className="font-mono text-xs">Unit: {unit}</span>
            {raw.channel && <span className="font-mono text-xs">Ch: {raw.channel}</span>}
            {isArchived ? (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                Archived
              </span>
            ) : (
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                  raw.status === "active"
                    ? "bg-green-100 text-green-800"
                    : "bg-brand-100 text-brand-700/70"
                }`}
              >
                {raw.status}
              </span>
            )}
          </div>
        </div>
        <Link
          href={`/dashboard/devices/${deviceId}/sensors/${sensorId}/edit`}
          className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 hover:border-brand-400 text-brand-800 font-semibold px-4 py-2 text-sm transition"
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          แก้ไข / ตั้งค่า
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <div className="card p-6">
            <h2 className="font-bold text-brand-800 mb-3">ข้อมูล Sensor</h2>
            <dl className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-brand-900/55">ชื่อ</dt>
                <dd className="font-semibold text-brand-800 mt-0.5">{raw.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-brand-900/55">ประเภท</dt>
                <dd className="font-semibold text-brand-800 mt-0.5">
                  {typeIcon} {typeLabel}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-brand-900/55">หน่วยวัด</dt>
                <dd className="font-semibold text-brand-800 mt-0.5">{unit}</dd>
              </div>
              <div>
                <dt className="text-xs text-brand-900/55">Channel / Address</dt>
                <dd className="font-mono text-sm text-brand-800 mt-0.5">{raw.channel ?? "-"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-brand-900/55">รายละเอียด</dt>
                <dd className="text-brand-900/85 mt-0.5 whitespace-pre-wrap">
                  {raw.description ?? "-"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="card p-6">
            <h2 className="font-bold text-brand-800">ค่าล่าสุด (Live)</h2>
            <div className="mt-4">
              <LiveSensorValue
                sensorId={sensorId}
                initialValue={latestRow ? Number(latestRow.value) : null}
                initialUnit={(latestRow?.unit as string | null) ?? null}
                initialOccurredAt={(latestRow?.occurred_at as string | null) ?? null}
                fallbackUnit={unit}
                size="lg"
              />
            </div>
            <p className="mt-4 text-xs text-brand-900/45">
              อัปเดตอัตโนมัติทุก 5 วินาที
            </p>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="card p-5">
            <div className="text-xs text-brand-900/55 mb-1">ที่ตั้ง</div>
            <div className="text-sm text-brand-900/80">
              <Link href={`/dashboard/farms/${farm.id}`} className="font-semibold text-brand-800 hover:text-brand-600 block">
                {farm.name}
              </Link>
              {zone && (
                <Link
                  href={`/dashboard/farms/${farm.id}/zones/${zone.id}`}
                  className="text-brand-700 hover:text-brand-900 block"
                >
                  แปลง: {zone.name}
                </Link>
              )}
              <Link
                href={`/dashboard/devices/${deviceId}`}
                className="text-brand-700 hover:text-brand-900 block mt-1"
              >
                อุปกรณ์: <span className="font-mono text-xs">{device.device_uid}</span>
              </Link>
            </div>
          </div>
          <div className="card p-5">
            <div className="text-xs text-brand-900/55">สร้างเมื่อ</div>
            <div className="font-semibold text-brand-800">{formatThaiDate(raw.created_at)}</div>
          </div>
          <div className="card p-5">
            <div className="text-xs text-brand-900/55">แก้ไขล่าสุด</div>
            <div className="font-semibold text-brand-800">{formatThaiDate(raw.updated_at)}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
