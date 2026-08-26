import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canCreateSensor, getUserPlan } from "@/lib/plan-limits";
import { getSensorTypeCatalog, visibleSensorTypesForPlan } from "@/lib/sensor-types";
import { SensorForm } from "../_components/SensorForm";
import { PlanLimitNotice } from "../../../../farms/_components/PlanLimitNotice";
import { createSensor } from "../actions";

export default async function NewSensorPage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  const { deviceId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: device } = await supabase
    .from("iot_nodes")
    .select("id, device_uid, device_name, farm_id, farms!inner(user_id, name)")
    .eq("id", deviceId)
    .maybeSingle();
  const farmRel = (device as unknown as { farms: { user_id: string; name: string } | { user_id: string; name: string }[] } | null)?.farms;
  const ownerId = Array.isArray(farmRel) ? farmRel[0]?.user_id : farmRel?.user_id;
  if (!device || ownerId !== user!.id) notFound();

  const [check, catalog, plan] = await Promise.all([
    canCreateSensor(supabase, user!.id),
    getSensorTypeCatalog(supabase),
    getUserPlan(supabase, user!.id),
  ]);
  const visibleTypes = visibleSensorTypesForPlan(catalog, plan.limits.max_sensors);
  const bound = createSensor.bind(null, deviceId);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href={`/dashboard/devices/${deviceId}`} className="hover:text-brand-900">
          ← {(device as { device_name: string }).device_name}
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-brand-800">เพิ่ม Sensor</h1>
      <p className="text-sm text-brand-900/60 mt-1">
        อุปกรณ์:{" "}
        <span className="font-mono">{(device as { device_uid: string }).device_uid}</span>
      </p>

      <div className="mt-6">
        {check.ok ? (
          <div className="space-y-3">
            {visibleTypes.length < catalog.length && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
                แพ็กเกจ {plan.name} เลือกได้ {visibleTypes.length} ประเภทจากทั้งหมด {catalog.length} ประเภท —{" "}
                <Link href="/pricing" className="font-semibold underline">
                  อัปเกรดแพ็กเกจ
                </Link>{" "}
                เพื่อปลดล็อกประเภทอื่น
              </div>
            )}
            <SensorForm
              action={bound}
              submitLabel="เพิ่ม Sensor"
              cancelHref={`/dashboard/devices/${deviceId}`}
              sensorTypes={visibleTypes}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <PlanLimitNotice
              planName={check.planName}
              current={check.current}
              limit={check.limit ?? 0}
              entity="Sensor"
            />
            <div className="flex justify-end">
              <Link
                href={`/dashboard/devices/${deviceId}`}
                className="rounded-full border border-border hover:bg-brand-50 text-brand-800 font-medium px-5 py-2.5 text-sm transition"
              >
                กลับไปอุปกรณ์
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
