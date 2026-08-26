import { createClient } from "@/lib/supabase/server";
import { getUserPlan, hasFeature } from "@/lib/plan-limits";
import { FeatureLockedNotice } from "@/app/dashboard/_components/FeatureLockedNotice";
import { AiAnalysisClient } from "./_components/AiAnalysisClient";

export default async function AiAnalysisPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const plan = await getUserPlan(supabase, user!.id);
  const allowed = hasFeature(plan, "ai");
  const advanced = hasFeature(plan, "ai_advanced");

  if (!allowed) {
    return (
      <div className="max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-brand-800">AI Analysis</h1>
          <p className="text-sm text-brand-900/60 mt-1">AI Analysis is not available on your current plan.</p>
        </div>
        <FeatureLockedNotice planName={plan.name} featureLabel="AI Analysis" />
      </div>
    );
  }

  const { data: farmRows } = await supabase.from("farms").select("id, name").eq("user_id", user!.id).is("archived_at", null).order("name");
  const farmIds = (farmRows ?? []).map((f) => f.id as string);

  const { data: deviceRows } = farmIds.length
    ? await supabase.from("iot_nodes").select("id, device_name, farm_id").in("farm_id", farmIds).is("archived_at", null).order("device_name")
    : { data: [] };

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-800">AI Analysis</h1>
        <p className="text-sm text-brand-900/60 mt-1">วิเคราะห์ข้อมูล Sensor ด้วย AI — สรุปแนวโน้ม ความผิดปกติ และคำแนะนำ</p>
      </div>

      <AiAnalysisClient
        farms={(farmRows ?? []) as { id: string; name: string }[]}
        devices={(deviceRows ?? []) as { id: string; device_name: string; farm_id: string }[]}
        advanced={advanced}
      />
    </div>
  );
}
