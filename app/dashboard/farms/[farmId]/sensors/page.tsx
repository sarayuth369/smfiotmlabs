import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPlan, getSensorUsage, formatLimit, usagePercent } from "@/lib/plan-limits";
import { getSensorTypeCatalog, sensorTypeLabelFrom, sensorTypeIconFrom } from "@/lib/sensor-types";

type SensorRow = {
  id: string;
  name: string;
  sensor_type: string;
  unit: string | null;
  channel: string | null;
  status: "active" | "inactive";
  device_id: string;
};

type DeviceRow = {
  id: string;
  device_uid: string;
  device_name: string;
};

export default async function FarmSensorsPage({
  params,
}: {
  params: Promise<{ farmId: string }>;
}) {
  const { farmId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: farm } = await supabase
    .from("farms")
    .select("id, name")
    .eq("id", farmId)
    .eq("user_id", user!.id)
    .maybeSingle();
  if (!farm) notFound();

  const { data: deviceRows } = await supabase
    .from("iot_nodes")
    .select("id, device_uid, device_name")
    .eq("farm_id", farmId)
    .is("archived_at", null)
    .order("device_name");
  const devices = (deviceRows ?? []) as DeviceRow[];
  const deviceIds = devices.map((d) => d.id);

  const { data: sensorRows } = deviceIds.length
    ? await supabase
        .from("sensors")
        .select("id, name, sensor_type, unit, channel, status, device_id")
        .in("device_id", deviceIds)
        .is("archived_at", null)
        .order("name")
    : { data: [] };
  const sensors = (sensorRows ?? []) as SensorRow[];

  const [userPlan, sensorUsage, sensorTypeCatalog] = await Promise.all([
    getUserPlan(supabase, user!.id),
    getSensorUsage(supabase, user!.id),
    getSensorTypeCatalog(supabase),
  ]);
  const sensorLimitLabel = formatLimit(userPlan.limits.max_sensors);
  const sensorPct = usagePercent(sensorUsage, userPlan.limits.max_sensors);
  const atSensorLimit = userPlan.limits.max_sensors !== null && sensorUsage >= userPlan.limits.max_sensors;

  const sensorsByDevice = new Map<string, SensorRow[]>();
  for (const s of sensors) {
    const list = sensorsByDevice.get(s.device_id) ?? [];
    list.push(s);
    sensorsByDevice.set(s.device_id, list);
  }

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href={`/dashboard/farms/${farmId}`} className="hover:text-brand-900">
          ← {farm.name}
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-800">Sensors</h1>
          <p className="mt-1 text-sm text-brand-900/60">
            Sensor ทั้งหมดในฟาร์ม &quot;{farm.name}&quot; — รวมทุกอุปกรณ์
          </p>
        </div>
        <div className="card px-4 py-2.5 text-right">
          <div className="text-xs text-brand-900/55">โควตา Sensor (บัญชี)</div>
          <div className="text-lg font-bold text-brand-800">
            {sensorUsage.toLocaleString()} / {sensorLimitLabel}
          </div>
          {userPlan.limits.max_sensors !== null && (
            <div className="mt-1 h-1.5 w-32 rounded-full bg-brand-100 overflow-hidden ml-auto">
              <div
                className={`h-full ${atSensorLimit ? "bg-red-500" : "bg-brand-600"}`}
                style={{ width: `${sensorPct}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {atSensorLimit && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          คุณใช้จำนวน Sensor ครบตามแพ็กเกจแล้ว ({sensorUsage}/{sensorLimitLabel}) — เก็บถาวร Sensor ที่ไม่ใช้ หรืออัปเกรดแพ็กเกจก่อนเพิ่มใหม่
        </div>
      )}

      {devices.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-4xl">📡</div>
          <div className="mt-3 font-semibold text-brand-800">ฟาร์มนี้ยังไม่มีอุปกรณ์ IoT</div>
          <p className="mt-1 text-sm text-brand-900/60">
            ต้องมีอุปกรณ์อย่างน้อย 1 ตัวก่อน ถึงจะเพิ่ม Sensor ได้ — Sensor ผูกกับอุปกรณ์เสมอ
          </p>
          <Link
            href={`/dashboard/devices/new?farm_id=${farmId}`}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 transition"
          >
            + เพิ่มอุปกรณ์
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {devices.map((device) => {
            const deviceSensors = sensorsByDevice.get(device.id) ?? [];
            return (
              <div key={device.id} className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="font-bold text-brand-800">{device.device_name}</div>
                    <div className="font-mono text-xs text-brand-900/55">{device.device_uid}</div>
                  </div>
                  <Link
                    href={`/dashboard/devices/${device.id}/sensors/new`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-3.5 py-2 transition"
                  >
                    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    เพิ่ม Sensor
                  </Link>
                </div>

                {deviceSensors.length === 0 ? (
                  <p className="text-sm text-brand-900/50">ยังไม่มี Sensor ในอุปกรณ์นี้</p>
                ) : (
                  <div className="divide-y divide-brand-100">
                    {deviceSensors.map((s) => (
                      <Link
                        key={s.id}
                        href={`/dashboard/devices/${device.id}/sensors/${s.id}`}
                        className="flex items-center justify-between gap-3 py-2.5 hover:bg-brand-50/60 -mx-2 px-2 rounded-lg transition"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-lg shrink-0">{sensorTypeIconFrom(sensorTypeCatalog, s.sensor_type)}</span>
                          <div className="min-w-0">
                            <div className="font-semibold text-brand-800 truncate">{s.name}</div>
                            <div className="text-xs text-brand-900/55">
                              {sensorTypeLabelFrom(sensorTypeCatalog, s.sensor_type)}
                              {s.channel && ` • Channel ${s.channel}`}
                              {s.unit && ` • ${s.unit}`}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            s.status === "active"
                              ? "bg-green-100 text-green-800"
                              : "bg-brand-100 text-brand-700/60"
                          }`}
                        >
                          {s.status === "active" ? "Active" : "Inactive"}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
