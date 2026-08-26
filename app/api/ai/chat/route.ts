import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPlan, hasFeature } from "@/lib/plan-limits";
import { getDeviceAiContext, getFarmAiContext } from "@/lib/ai/context";
import { buildChatSystemPrompt } from "@/lib/ai/prompt";
import { AIService, friendlyAiError, type AiChatTurn } from "@/lib/ai";
import { checkAiQuota, logAiRequest } from "@/lib/ai/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_HISTORY_TURNS = 6;
const MAX_QUESTION_LEN = 500;

type Body = {
  device_id?: string;
  farm_id?: string;
  scope?: "device" | "farm";
  period_days?: number;
  history?: AiChatTurn[];
  question?: string;
};

function isValidHistory(x: unknown): x is AiChatTurn[] {
  return Array.isArray(x) && x.every((h) => h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string");
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const admin = createAdminClient();
  const plan = await getUserPlan(supabase, user.id);
  if (!hasFeature(plan, "ai")) {
    return NextResponse.json({ error: "AI Analysis is not available on your current plan." }, { status: 403 });
  }
  const advanced = hasFeature(plan, "ai_advanced");

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const question = String(body.question ?? "").trim().slice(0, MAX_QUESTION_LEN);
  if (!question) return NextResponse.json({ error: "question is required" }, { status: 400 });

  const history = isValidHistory(body.history) ? body.history.slice(-MAX_HISTORY_TURNS) : [];

  const scope = body.scope === "farm" ? "farm" : "device";
  if (scope === "farm" && !advanced) {
    return NextResponse.json({ error: "Multi-device analysis is not available on your current plan." }, { status: 403 });
  }
  const periodDays = Math.max(1, Math.min(14, Number(body.period_days) || 7));

  const quota = await checkAiQuota(admin, user.id, "chat", plan.limits.max_ai_chat_per_month);
  if (!quota.ok) {
    return NextResponse.json({ error: "AI usage limit reached for this plan." }, { status: 429 });
  }

  try {
    const contexts =
      scope === "device"
        ? body.device_id
          ? [await getDeviceAiContext(supabase, user.id, body.device_id, periodDays, plan.limits.sensor_history_days)]
          : (() => {
              throw new Error("device_id is required");
            })()
        : body.farm_id
          ? await getFarmAiContext(supabase, user.id, body.farm_id, periodDays, plan.limits.sensor_history_days)
          : (() => {
              throw new Error("farm_id is required");
            })();

    const system = buildChatSystemPrompt(contexts, advanced);
    const { result, providerId, model } = await AIService.chat(system, history, question);

    await logAiRequest(admin, {
      user_id: user.id,
      kind: "chat",
      provider: providerId,
      model,
      device_id: scope === "device" ? (body.device_id ?? null) : null,
      ok: true,
    });

    return NextResponse.json({ ...result, generated_at: new Date().toISOString() });
  } catch (e) {
    await logAiRequest(admin, {
      user_id: user.id,
      kind: "chat",
      provider: null,
      model: null,
      device_id: scope === "device" ? (body.device_id ?? null) : null,
      ok: false,
      error: (e as Error).message?.slice(0, 300),
    });
    const known = e instanceof Error && (e.message.includes("ไม่พบ") || e.message.includes("ไม่มีสิทธิ์") || e.message.includes("required"));
    if (known) return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 400 });
    return NextResponse.json({ error: friendlyAiError(e) }, { status: 502 });
  }
}
