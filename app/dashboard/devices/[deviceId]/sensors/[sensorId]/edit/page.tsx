import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canCreateSensor } from "@/lib/plan-limits";
import { SensorForm, type SensorFormValues } from "../../_components/SensorForm";
import { updateSensor } from "../../actions";
import {
  ArchiveSensorButton,
  RestoreSensorButton,
  DeleteSensorButton,
} from "../../_components/SensorArchiveButtons";

export default async function EditSensorPage({
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
    .select("id, device_id, name, sensor_type, unit, description, channel, status, archived_at, iot_nodes!inner(farms!inner(user_id))")
    .eq("id", sensorId)
    .eq("device_id", deviceId)
    .maybeSingle();
  if (!data) notFound();

  // Verify ownership via nested farm.user_id
  const rel = (data as unknown as { iot_nodes: { farms: { user_id: string } | { user_id: string }[] } | { farms: { user_id: string } | { user_id: string }[] }[] }).iot_nodes;
  const nodeRow = Array.isArray(rel) ? rel[0] : rel;
  const farmRow = nodeRow ? (Array.isArray(nodeRow.farms) ? nodeRow.farms[0] : nodeRow.farms) : null;
  if (!farmRow || farmRow.user_id !== user!.id) notFound();

  const initial = data as unknown as SensorFormValues & { archived_at: string | null; name: string };
  const isArchived = !!initial.archived_at;
  const bound = updateSensor.bind(null, deviceId, sensorId);
  const check = isArchived ? await canCreateSensor(supabase, user!.id) : null;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href={`/dashboard/devices/${deviceId}/sensors/${sensorId}`} className="hover:text-brand-900">
          ← กลับไป Sensor
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-brand-800">แก้ไข Sensor</h1>
      <p className="text-sm text-brand-900/60 mt-1">
        {isArchived ? "Sensor นี้ถูกเก็บถาวรอยู่" : initial.name}
      </p>

      <div className="mt-6 space-y-6">
        {isArchived && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-bold text-amber-900">Sensor นี้อยู่ในสถานะเก็บถาวร</div>
              <div className="text-sm text-amber-900/80 mt-0.5">
                ไม่นับรวมโควตาแพ็กเกจ — กู้คืนเพื่อกลับมาใช้งาน
              </div>
            </div>
            <RestoreSensorButton
              deviceId={deviceId}
              sensorId={sensorId}
              sensorName={initial.name}
              canRestore={check?.ok ?? false}
            />
          </div>
        )}

        <SensorForm
          action={bound}
          initial={initial}
          submitLabel="บันทึกการเปลี่ยนแปลง"
          cancelHref={`/dashboard/devices/${deviceId}/sensors/${sensorId}`}
        />

        <div className="card p-6 border-red-200 space-y-4">
          <div>
            <h2 className="font-bold text-red-700">Danger Zone</h2>
            <p className="text-sm text-brand-900/60 mt-1">
              เก็บถาวรเพื่อซ่อน Sensor — ลบถาวรจะเสียประวัติทั้งหมด ย้อนกลับไม่ได้
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isArchived && (
              <ArchiveSensorButton
                deviceId={deviceId}
                sensorId={sensorId}
                sensorName={initial.name}
              />
            )}
            <DeleteSensorButton deviceId={deviceId} sensorId={sensorId} sensorName={initial.name} />
          </div>
        </div>
      </div>
    </div>
  );
}
