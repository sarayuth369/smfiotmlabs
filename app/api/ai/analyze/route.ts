import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPlan, hasFeature } from "@/lib/plan-limits";
import { getDeviceAiContext, getFarmAiContext } from "@/lib/ai/context";
import { buildAnalysisPrompt } from "@/lib/ai/prompt";
import { AIService, friendlyAiError } from "@/lib/ai";
import { checkAiQuota, logAiRequest, findCachedAnalysis } from "@/lib/ai/quota";
import { getFarmIdForDevice, getZoneForDevice, getPrimaryZoneForFarm, daysUntil, type ZoneInfo } from "@/lib/farm-location";
import { getWeatherPromptContext } from "@/lib/weather";
import type { ZonePromptContext } from "@/lib/ai/prompt";

function toZoneSummary(zone: ZoneInfo | null) {
  if (!zone) return null;
  return {
    id: zone.id,
    name: zone.name,
    crop_type: zone.crop_type,
    planting_date: zone.planting_date,
    expected_harvest_date: zone.expected_harvest_date,
    days_to_harvest: daysUntil(zone.expected_harvest_date),
  };
}

function toZonePromptContext(zone: ZoneInfo | null): ZonePromptContext | null {
  if (!zone) return null;
  return { zone, daysToHarvest: daysUntil(zone.expected_harvest_date) };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 58; // headroom above gemini-provider.ts's 55s request timeout

type Body = { device_id?: string; farm_id?: string; scope?: "device" | "farm"; period_days?: number };

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

  const scope = body.scope === "farm" ? "farm" : "device";
  if (scope === "farm" && !advanced) {
    return NextResponse.json({ error: "Multi-device analysis is not available on your current plan." }, { status: 403 });
  }
  const periodDays = Math.max(1, Math.min(14, Number(body.period_days) || 7));

  try {
    if (scope === "device") {
      if (!body.device_id) return NextResponse.json({ error: "device_id is required" }, { status: 400 });

      const cached = await findCachedAnalysis(admin, user.id, body.device_id, periodDays);
      if (cached) {
        // Zone is a cheap direct DB read (no AI call) — always resolve fresh so the header never shows stale crop/harvest data even on a cache hit.
        const cachedZone = await getZoneForDevice(supabase, user.id, body.device_id);
        return NextResponse.json({ ...cached.result, cached: true, provider: cached.provider, model: cached.model, zone: toZoneSummary(cachedZone) });
      }

      const quota = await checkAiQuota(admin, user.id, "analyze", plan.limits.max_ai_analyses_per_month);
      if (!quota.ok) {
        return NextResponse.json({ error: "AI usage limit reached for this plan." }, { status: 429 });
      }

      const context = await getDeviceAiContext(supabase, user.id, body.device_id, periodDays, plan.limits.sensor_history_days);
      if (context.sensors.every((s) => s.sample_count === 0)) {
        return NextResponse.json({ error: "Not enough sensor history for analysis." }, { status: 422 });
      }

      const farmId = await getFarmIdForDevice(supabase, user.id, body.device_id);
      const weather = await getWeatherPromptContext(supabase, admin, user.id, farmId);
      const zone = await getZoneForDevice(supabase, user.id, body.device_id);

      const { system, user: userPrompt } = buildAnalysisPrompt([context], advanced, weather, toZonePromptContext(zone));
      const { result, providerId, model } = await AIService.analyze(system, userPrompt);

      await logAiRequest(admin, { user_id: user.id, kind: "analyze", provider: providerId, model, device_id: body.device_id, period_days: periodDays, ok: true, result });
      return NextResponse.json({ ...result, cached: false, provider: providerId, model, zone: toZoneSummary(zone) });
    }

    // scope === "farm" (Business/Premium multi-device)
    if (!body.farm_id) return NextResponse.json({ error: "farm_id is required" }, { status: 400 });

    const quota = await checkAiQuota(admin, user.id, "analyze", plan.limits.max_ai_analyses_per_month);
    if (!quota.ok) {
      return NextResponse.json({ error: "AI usage limit reached for this plan." }, { status: 429 });
    }

    const contexts = await getFarmAiContext(supabase, user.id, body.farm_id, periodDays, plan.limits.sensor_history_days);
    if (contexts.length === 0 || contexts.every((c) => c.sensors.every((s) => s.sample_count === 0))) {
      return NextResponse.json({ error: "Not enough sensor history for analysis." }, { status: 422 });
    }

    const weather = await getWeatherPromptContext(supabase, admin, user.id, body.farm_id);
    const zone = await getPrimaryZoneForFarm(supabase, user.id, body.farm_id);

    const { system, user: userPrompt } = buildAnalysisPrompt(contexts, advanced, weather, toZonePromptContext(zone));
    const { result, providerId, model } = await AIService.analyze(system, userPrompt);

    await logAiRequest(admin, { user_id: user.id, kind: "analyze", provider: providerId, model, device_id: null, period_days: periodDays, ok: true, result });
    return NextResponse.json({ ...result, cached: false, provider: providerId, model, zone: toZoneSummary(zone) });
  } catch (e) {
    await logAiRequest(admin, {
      user_id: user.id,
      kind: "analyze",
      provider: null,
      model: null,
      device_id: body.device_id ?? null,
      ok: false,
      error: (e as Error).message?.slice(0, 300),
    });
    const known = e instanceof Error && (e.message.includes("ไม่พบ") || e.message.includes("ไม่มีสิทธิ์"));
    if (known) return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 404 });
    return NextResponse.json({ error: friendlyAiError(e) }, { status: 502 });
  }
}
