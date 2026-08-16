import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canCreateZone } from "@/lib/plan-limits";
import { ZoneForm, type ZoneFormValues } from "../../_components/ZoneForm";
import { updateZone } from "../../actions";
import {
  ArchiveZoneButton,
  RestoreZoneButton,
  DeleteZoneButton,
} from "../../_components/ZoneArchiveButtons";

export default async function EditZonePage({
  params,
}: {
  params: Promise<{ farmId: string; zoneId: string }>;
}) {
  const { farmId, zoneId } = await params;
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

  const { data } = await supabase
    .from("zones")
    .select("id, name, description, area, area_unit, crop_type, planting_date, expected_harvest_date, archived_at")
    .eq("id", zoneId)
    .eq("farm_id", farmId)
    .maybeSingle();
  if (!data) notFound();
  const initial = data as ZoneFormValues & { id: string; archived_at: string | null; name: string };
  const isArchived = !!initial.archived_at;

  const boundUpdate = updateZone.bind(null, farmId, zoneId);
  const check = isArchived ? await canCreateZone(supabase, user!.id) : null;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href={`/dashboard/farms/${farmId}/zones/${zoneId}`} className="hover:text-brand-900">
          ← กลับไปแปลง
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-brand-800">แก้ไขแปลง</h1>
      <p className="text-sm text-brand-900/60 mt-1">
        {isArchived ? "แปลงนี้ถูกเก็บถาวรอยู่ — กู้คืนก่อนเพื่อใช้งานต่อ" : `แปลงในฟาร์ม ${farm.name}`}
      </p>

      <div className="mt-6 space-y-6">
        {isArchived && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-bold text-amber-900">แปลงนี้อยู่ในสถานะเก็บถาวร</div>
              <div className="text-sm text-amber-900/80 mt-0.5">
                ไม่นับรวมโควตาแพ็กเกจ — กู้คืนเพื่อกลับมาใช้งาน
              </div>
            </div>
            <RestoreZoneButton
              farmId={farmId}
              zoneId={zoneId}
              zoneName={initial.name}
              canRestore={check?.ok ?? false}
            />
          </div>
        )}

        <ZoneForm
          action={boundUpdate}
          initial={initial}
          submitLabel="บันทึกการเปลี่ยนแปลง"
          cancelHref={`/dashboard/farms/${farmId}/zones/${zoneId}`}
        />

        <div className="card p-6 border-red-200 space-y-4">
          <div>
            <h2 className="font-bold text-red-700">Danger Zone</h2>
            <p className="text-sm text-brand-900/60 mt-1">
              แนะนำใช้ &quot;เก็บถาวร&quot; เพื่อซ่อนแปลง — ลบถาวรจะเสียข้อมูลไม่สามารถย้อนกลับได้
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isArchived && (
              <ArchiveZoneButton farmId={farmId} zoneId={zoneId} zoneName={initial.name} />
            )}
            <DeleteZoneButton farmId={farmId} zoneId={zoneId} zoneName={initial.name} />
          </div>
        </div>
      </div>
    </div>
  );
}
