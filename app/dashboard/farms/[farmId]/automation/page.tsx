import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPlan, hasFeature } from "@/lib/plan-limits";
import { FeatureLockedNotice } from "@/app/dashboard/_components/FeatureLockedNotice";
import { getDeviceScheduleAndRules } from "./actions";
import { DeviceRulesPanel } from "./_components/DeviceRulesPanel";
import { listAutomations } from "./automation-actions";
import { AutomationPanel } from "./_components/AutomationPanel";

type DeviceRow = { id: string; device_uid: string; device_name: string };
type RelayRow = { channel: number; name: string; device_id: string };
type SensorRow = { id: string; name: string; sensor_type: string; unit: string | null; device_id: string };

export default async function FarmAutomationPage({
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

  const plan = await getUserPlan(supabase, user!.id);
  const planAllowsRules = hasFeature(plan, "rules");
  const planAllowsAutomation = hasFeature(plan, "automation");

  const { data: deviceRows } = await supabase
    .from("iot_nodes")
    .select("id, device_uid, device_name")
    .eq("farm_id", farmId)
    .is("archived_at", null)
    .order("device_name");
  const devices = (deviceRows ?? []) as DeviceRow[];
  const deviceIds = devices.map((d) => d.id);

  const { data: relayRows } = deviceIds.length
    ? await supabase
        .from("relays")
        .select("channel, name, device_id")
        .in("device_id", deviceIds)
        .is("archived_at", null)
        .order("channel")
    : { data: [] };
  const relays = (relayRows ?? []) as RelayRow[];
  const relaysByDevice = new Map<string, RelayRow[]>();
  for (const r of relays) {
    const list = relaysByDevice.get(r.device_id) ?? [];
    list.push(r);
    relaysByDevice.set(r.device_id, list);
  }

  const { data: sensorRows } = deviceIds.length
    ? await supabase
        .from("sensors")
        .select("id, name, sensor_type, unit, device_id")
        .in("device_id", deviceIds)
        .is("archived_at", null)
        .order("name")
    : { data: [] };
  const sensors = (sensorRows ?? []) as SensorRow[];

  const deviceData = planAllowsRules ? await Promise.all(devices.map((d) => getDeviceScheduleAndRules(d.id))) : [];
  const automationData = await listAutomations(farmId);

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href={`/dashboard/farms/${farmId}`} className="hover:text-brand-900">
          ← {farm.name}
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-800">Automation</h1>
        <p className="mt-1 text-sm text-brand-900/60">
          ตั้งเงื่อนไขอัตโนมัติจากค่าเซนเซอร์หรือตั้งเวลา แล้วสั่งเปิด/ปิด Relay หรือแจ้งเตือนโดยอัตโนมัติ
        </p>
      </div>

      {devices.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-4xl">🧩</div>
          <div className="mt-3 font-semibold text-brand-800">ฟาร์มนี้ยังไม่มีอุปกรณ์ IoT</div>
          <p className="mt-1 text-sm text-brand-900/60">ต้องมีอุปกรณ์อย่างน้อย 1 ตัวก่อน ถึงจะตั้ง Automation ได้</p>
          <Link
            href={`/dashboard/devices/new?farm_id=${farmId}`}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 transition"
          >
            + เพิ่มอุปกรณ์
          </Link>
        </div>
      ) : !planAllowsAutomation ? (
        <FeatureLockedNotice planName={plan.name} featureLabel="Automation" />
      ) : (
        <AutomationPanel
          farmId={farmId}
          devices={devices}
          relaysByDevice={Object.fromEntries(relaysByDevice)}
          sensors={sensors}
          initialRows={automationData.rows}
          initialActivity={automationData.activity}
          quota={automationData.quota}
        />
      )}

      <div className="mt-8">
        <h2 className="text-sm font-bold text-brand-900/70 uppercase tracking-wider mb-3">
          ตั้งเวลา/กฎบนอุปกรณ์โดยตรง (ทำงานบน ESP32 — ใช้ได้แม้ออฟไลน์)
        </h2>
        {!planAllowsRules ? (
          <FeatureLockedNotice planName={plan.name} featureLabel="Rules" compact />
        ) : devices.length === 0 ? null : (
          <div className="space-y-5">
            {devices.map((device, i) => (
              <DeviceRulesPanel
                key={device.id}
                deviceId={device.id}
                deviceName={device.device_name}
                deviceUid={device.device_uid}
                farmId={farmId}
                relays={relaysByDevice.get(device.id) ?? []}
                initialSchedules={deviceData[i].schedules}
                initialRules={deviceData[i].rules}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
