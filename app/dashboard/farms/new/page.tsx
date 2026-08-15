import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { canCreateFarm } from "@/lib/plan-limits";
import { FarmForm } from "../_components/FarmForm";
import { PlanLimitNotice } from "../_components/PlanLimitNotice";
import { createFarm } from "../actions";

export default async function NewFarmPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const check = await canCreateFarm(supabase, user!.id);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href="/dashboard/farms" className="hover:text-brand-900">← ฟาร์มของฉัน</Link>
      </div>
      <h1 className="text-2xl font-bold text-brand-800">เพิ่มฟาร์ม</h1>
      <p className="text-sm text-brand-900/60 mt-1">กรอกข้อมูลฟาร์มของคุณ</p>

      <div className="mt-6">
        {check.ok ? (
          <FarmForm action={createFarm} submitLabel="บันทึกฟาร์ม" cancelHref="/dashboard/farms" />
        ) : (
          <div className="space-y-4">
            <PlanLimitNotice
              planName={check.planName}
              current={check.current}
              limit={check.limit ?? 0}
            />
            <div className="flex justify-end">
              <Link
                href="/dashboard/farms"
                className="rounded-full border border-border hover:bg-brand-50 text-brand-800 font-medium px-5 py-2.5 text-sm transition"
              >
                กลับไปฟาร์มของฉัน
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
