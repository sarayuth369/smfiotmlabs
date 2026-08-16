import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canCreateNode } from "@/lib/plan-limits";
import { DeviceForm, type DeviceFormValues } from "../../_components/DeviceForm";
import { updateDevice } from "../../actions";
import {
  ArchiveDeviceButton,
  RestoreDeviceButton,
  DeleteDeviceButton,
} from "../../_components/DeviceArchiveButtons";

export default async function EditDevicePage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  const { deviceId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("iot_nodes")
    .select("id, device_uid, device_name, farm_id, zone_id, device_type, model, firmware_version, archived_at")
    .eq("id", deviceId)
    .maybeSingle();
  if (!data) notFound();

  // Ownership check via parent farm
  const { data: ownedCheck } = await supabase
    .from("farms")
    .select("id")
    .eq("id", (data as { farm_id: string }).farm_id)
    .eq("user_id", user!.id)
    .maybeSingle();
  if (!ownedCheck) notFound();

  const [{ data: farms }, checkForRestore] = await Promise.all([
    supabase
      .from("farms")
      .select("id, name")
      .eq("user_id", user!.id)
      .is("archived_at", null)
      .order("name"),
    canCreateNode(supabase, user!.id),
  ]);
  const farmList = (farms ?? []).map((f) => ({ id: f.id as string, name: f.name as string }));
  const farmIds = farmList.map((f) => f.id);
  const { data: zonesData } = farmIds.length
    ? await supabase
        .from("zones")
        .select("id, name, farm_id")
        .in("farm_id", farmIds)
        .is("archived_at", null)
        .order("name")
    : { data: [] as { id: string; name: string; farm_id: string }[] };
  const zoneList = (zonesData ?? []).map((z) => ({
    id: z.id as string,
    name: z.name as string,
    farm_id: z.farm_id as string,
  }));

  const initial = data as DeviceFormValues & { archived_at: string | null; device_uid: string };
  const isArchived = !!initial.archived_at;
  const boundUpdate = updateDevice.bind(null, deviceId);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href={`/dashboard/devices/${deviceId}`} className="hover:text-brand-900">
          ← กลับไปอุปกรณ์
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-brand-800">แก้ไขอุปกรณ์</h1>
      <p className="text-sm text-brand-900/60 mt-1">
        {isArchived ? "อุปกรณ์นี้ถูกเก็บถาวรอยู่" : `Device UID: ${initial.device_uid}`}
      </p>

      <div className="mt-6 space-y-6">
        {isArchived && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-bold text-amber-900">อุปกรณ์นี้อยู่ในสถานะเก็บถาวร</div>
              <div className="text-sm text-amber-900/80 mt-0.5">
                ไม่นับรวมโควตาแพ็กเกจ — กู้คืนเพื่อกลับมาใช้งาน
              </div>
            </div>
            <RestoreDeviceButton
              deviceId={deviceId}
              deviceLabel={initial.device_uid}
              canRestore={checkForRestore.ok}
            />
          </div>
        )}

        <DeviceForm
          action={boundUpdate}
          farms={farmList}
          zones={zoneList}
          initial={initial}
          submitLabel="บันทึกการเปลี่ยนแปลง"
          cancelHref={`/dashboard/devices/${deviceId}`}
          lockUid
        />

        <div className="card p-6 border-red-200 space-y-4">
          <div>
            <h2 className="font-bold text-red-700">Danger Zone</h2>
            <p className="text-sm text-brand-900/60 mt-1">
              เก็บถาวรเพื่อซ่อนอุปกรณ์ออกจากรายการ — ลบถาวรจะเสียข้อมูลไม่สามารถย้อนกลับได้
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isArchived && (
              <ArchiveDeviceButton deviceId={deviceId} deviceLabel={initial.device_uid} />
            )}
            <DeleteDeviceButton deviceId={deviceId} deviceLabel={initial.device_uid} />
          </div>
        </div>
      </div>
    </div>
  );
}
