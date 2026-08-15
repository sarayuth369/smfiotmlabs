import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FarmForm, type FarmFormValues } from "../../_components/FarmForm";
import { updateFarm, deleteFarm } from "../../actions";
import { DeleteFarmButton } from "./_components/DeleteFarmButton";

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
      "id, name, description, province, district, subdistrict, area, area_unit, farm_type, latitude, longitude"
    )
    .eq("id", farmId)
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!data) notFound();
  const initial = data as FarmFormValues & { id: string };

  const boundUpdate = updateFarm.bind(null, farmId);
  const boundDelete = deleteFarm.bind(null, farmId);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href={`/dashboard/farms/${farmId}`} className="hover:text-brand-900">
          ← กลับไปฟาร์ม
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-brand-800">ตั้งค่าฟาร์ม</h1>
      <p className="text-sm text-brand-900/60 mt-1">แก้ไขข้อมูลฟาร์มของคุณ</p>

      <div className="mt-6 space-y-6">
        <FarmForm
          action={boundUpdate}
          initial={initial}
          submitLabel="บันทึกการเปลี่ยนแปลง"
          cancelHref={`/dashboard/farms/${farmId}`}
        />

        <div className="card p-6 border-red-200">
          <h2 className="font-bold text-red-700">Danger Zone</h2>
          <p className="text-sm text-brand-900/60 mt-1">
            การลบฟาร์มจะลบข้อมูลที่ผูกกับฟาร์มนี้ทั้งหมด ไม่สามารถย้อนกลับได้
          </p>
          <div className="mt-4">
            <DeleteFarmButton action={boundDelete} farmName={initial.name ?? "ฟาร์มนี้"} />
          </div>
        </div>
      </div>
    </div>
  );
}
