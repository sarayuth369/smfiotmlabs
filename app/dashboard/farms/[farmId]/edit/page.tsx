import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canCreateFarm } from "@/lib/plan-limits";
import { FarmForm, type FarmFormValues } from "../../_components/FarmForm";
import { updateFarm, deleteFarm } from "../../actions";
import { DeleteFarmButton } from "./_components/DeleteFarmButton";
import { ArchiveFarmButton, RestoreFarmButton } from "../../_components/ArchiveButtons";

export default async function EditFarmPage({
  params,
}: {
  params: Promise<{ farmId: string }>;
}) {
  const { farmId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("farms")
    .select(
      "id, name, description, province, district, subdistrict, area, area_unit, farm_type, latitude, longitude, archived_at"
    )
    .eq("id", farmId)
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!data) notFound();
  const initial = data as FarmFormValues & { id: string; archived_at: string | null };
  const isArchived = !!initial.archived_at;

  const boundUpdate = updateFarm.bind(null, farmId);
  const boundDelete = deleteFarm.bind(null, farmId);

  // Only needed if archived (for restore-limit check)
  const check = isArchived ? await canCreateFarm(supabase, user!.id) : null;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href={`/dashboard/farms/${farmId}`} className="hover:text-brand-900">
          ← กลับไปฟาร์ม
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-brand-800">ตั้งค่าฟาร์ม</h1>
      <p className="text-sm text-brand-900/60 mt-1">
        {isArchived ? "ฟาร์มนี้ถูกเก็บถาวรอยู่ — กู้คืนก่อนเพื่อใช้งานต่อ" : "แก้ไขข้อมูลฟาร์มของคุณ"}
      </p>

      <div className="mt-6 space-y-6">
        {isArchived && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-bold text-amber-900">ฟาร์มนี้อยู่ในสถานะเก็บถาวร</div>
              <div className="text-sm text-amber-900/80 mt-0.5">
                ไม่นับรวมโควตาแพ็กเกจ — กู้คืนเพื่อกลับมาใช้งาน
              </div>
            </div>
            <RestoreFarmButton
              farmId={farmId}
              farmName={initial.name ?? "ฟาร์มนี้"}
              canRestore={check?.ok ?? false}
            />
          </div>
        )}

        <FarmForm
          action={boundUpdate}
          initial={initial}
          submitLabel="บันทึกการเปลี่ยนแปลง"
          cancelHref={`/dashboard/farms/${farmId}`}
        />

        <div className="card p-6 border-red-200 space-y-4">
          <div>
            <h2 className="font-bold text-red-700">Danger Zone</h2>
            <p className="text-sm text-brand-900/60 mt-1">
              การเก็บถาวรฟาร์มจะซ่อนออกจากรายการหลัก (กู้คืนได้) — การลบฟาร์มจะลบข้อมูลถาวรไม่สามารถย้อนกลับได้
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isArchived && (
              <ArchiveFarmButton farmId={farmId} farmName={initial.name ?? "ฟาร์มนี้"} />
            )}
            <DeleteFarmButton action={boundDelete} farmName={initial.name ?? "ฟาร์มนี้"} />
          </div>
        </div>
      </div>
    </div>
  );
}
