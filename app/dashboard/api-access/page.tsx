import { createClient } from "@/lib/supabase/server";
import { getUserPlan, hasFeature } from "@/lib/plan-limits";
import { FeatureLockedNotice } from "@/app/dashboard/_components/FeatureLockedNotice";
import { ApiKeysSection, type ApiKeyRow } from "./_components/ApiKeysSection";
import { WebhooksSection, type WebhookRow } from "./_components/WebhooksSection";
import { ApiDocs } from "./_components/ApiDocs";

export default async function ApiAccessPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const plan = await getUserPlan(supabase, user!.id);
  const planAllowsApi = hasFeature(plan, "api");
  const planAllowsControl = hasFeature(plan, "api_control");

  const [{ data: keyRows }, { data: farmRows }] = await Promise.all([
    planAllowsApi
      ? supabase
          .from("api_keys")
          .select("id, name, key_prefix, permissions, scope_device_ids, created_at, last_used_at, revoked_at")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase.from("farms").select("id").eq("user_id", user!.id),
  ]);

  const farmIds = (farmRows ?? []).map((f) => f.id as string);
  const { data: deviceRows } = farmIds.length
    ? await supabase.from("iot_nodes").select("id, device_name").in("farm_id", farmIds).is("archived_at", null).order("device_name")
    : { data: [] };

  const webhooksResult = planAllowsControl
    ? await supabase.from("webhooks").select("id, url, events, enabled, created_at").order("created_at", { ascending: false })
    : { data: [] };

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-800">API Access</h1>
        <p className="text-sm text-brand-900/60 mt-1">
          เชื่อมต่อระบบภายนอกกับข้อมูลอุปกรณ์และ Sensor ของคุณผ่าน REST API
        </p>
      </div>

      <div className="card p-5 mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs text-brand-900/55">API Status</div>
          <div className={`font-bold ${planAllowsApi ? "text-green-700" : "text-brand-900/50"}`}>
            {planAllowsApi ? "● Enabled" : "○ Not available on your plan"}
          </div>
        </div>
        {planAllowsApi && (
          <div className="text-right text-xs text-brand-900/55">
            แพ็กเกจ {plan.name} · Rate limit {plan.limits.api_rate_limit_per_min ?? "ไม่จำกัด"} req/min
            {planAllowsControl && " · Control API + Webhook"}
          </div>
        )}
      </div>

      {!planAllowsApi ? (
        <FeatureLockedNotice planName={plan.name} featureLabel="API Access" />
      ) : (
        <div className="space-y-6">
          <ApiKeysSection
            keys={(keyRows ?? []) as ApiKeyRow[]}
            devices={(deviceRows ?? []) as { id: string; device_name: string }[]}
            planAllowsControl={planAllowsControl}
            maxKeys={plan.limits.max_api_keys}
          />

          {planAllowsControl && <WebhooksSection webhooks={(webhooksResult.data ?? []) as WebhookRow[]} />}

          <ApiDocs baseUrl="https://smfiot.bkknex.com" />
        </div>
      )}
    </div>
  );
}
