import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canCreateZone } from "@/lib/plan-limits";
import { ZoneForm } from "../_components/ZoneForm";
import { PlanLimitNotice } from "../../../_components/PlanLimitNotice";
import { createZone } from "../actions";

export default async function NewZonePage({
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

  const check = await canCreateZone(supabase, user!.id);
  const boundCreate = createZone.bind(null, farmId);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href={`/dashboard/farms/${farmId}/zones`} className="hover:text-brand-900">
          ← แปลง / Zone ({farm.name})
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-brand-800">เพิ่มแปลง</h1>
      <p className="text-sm text-brand-900/60 mt-1">
        เพิ่มแปลงปลูกใหม่ในฟาร์ม <span className="font-semibold">{farm.name}</span>
      </p>

      <div className="mt-6">
        {check.ok ? (
          <ZoneForm
            action={boundCreate}
            submitLabel="บันทึกแปลง"
            cancelHref={`/dashboard/farms/${farmId}/zones`}
          />
        ) : (
          <div className="space-y-4">
            <PlanLimitNotice
              planName={check.planName}
              current={check.current}
              limit={check.limit ?? 0}
              entity="แปลง"
            />
            <div className="flex justify-end">
              <Link
                href={`/dashboard/farms/${farmId}/zones`}
                className="rounded-full border border-border hover:bg-brand-50 text-brand-800 font-medium px-5 py-2.5 text-sm transition"
              >
                กลับไปรายการแปลง
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
