import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDeviceNotificationConfig } from "./actions";
import { DeviceNotificationsPanel } from "./_components/DeviceNotificationsPanel";

type DeviceRow = { id: string; device_uid: string; device_name: string };

export default async function FarmNotificationsPage({
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

  const deviceConfigs = await Promise.all(devices.map((d) => getDeviceNotificationConfig(d.id)));

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href={`/dashboard/farms/${farmId}`} className="hover:text-brand-900">
          ← {farm.name}
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-800">การแจ้งเตือน</h1>
        <p className="mt-1 text-sm text-brand-900/60">
          แจ้งเตือนผ่าน LINE และบันทึกค่าลง Google Sheet — ทำงานบน ESP32 โดยตรง (ไม่ต้องเปิดแอพหรือเว็บค้างไว้)
        </p>
      </div>

      {devices.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-4xl">🔔</div>
          <div className="mt-3 font-semibold text-brand-800">ฟาร์มนี้ยังไม่มีอุปกรณ์ IoT</div>
          <p className="mt-1 text-sm text-brand-900/60">ต้องมีอุปกรณ์อย่างน้อย 1 ตัวก่อน ถึงจะตั้งการแจ้งเตือนได้</p>
          <Link
            href={`/dashboard/devices/new?farm_id=${farmId}`}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 transition"
          >
            + เพิ่มอุปกรณ์
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {devices.map((device, i) => (
            <DeviceNotificationsPanel
              key={device.id}
              deviceId={device.id}
              deviceName={device.device_name}
              deviceUid={device.device_uid}
              initialLine={deviceConfigs[i].line}
              initialSheets={deviceConfigs[i].sheets}
            />
          ))}
        </div>
      )}
    </div>
  );
}
