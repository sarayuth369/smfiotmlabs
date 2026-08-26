import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPlan, hasFeature } from "@/lib/plan-limits";
import { getProviderStatuses } from "@/lib/admin/ai-settings";
import { checkAiQuota } from "@/lib/ai/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const admin = createAdminClient();
  const plan = await getUserPlan(supabase, user.id);
  const allowed = hasFeature(plan, "ai");
  const advanced = hasFeature(plan, "ai_advanced");

  // Provider identity/model only — never key material.
  const providers = allowed ? await getProviderStatuses() : [];

  const [analyzeQuota, chatQuota] = allowed
    ? await Promise.all([
        checkAiQuota(admin, user.id, "analyze", plan.limits.max_ai_analyses_per_month),
        checkAiQuota(admin, user.id, "chat", plan.limits.max_ai_chat_per_month),
      ])
    : [null, null];

  return NextResponse.json({
    allowed,
    advanced,
    plan_name: plan.name,
    providers: providers.map((p) => ({ id: p.id, enabled: p.enabled, configured: p.configured, active: p.active })),
    quota: allowed
      ? {
          analyze: { used: analyzeQuota!.used, limit: analyzeQuota!.limit },
          chat: { used: chatQuota!.used, limit: chatQuota!.limit },
        }
      : null,
  });
}
