/**
 * Phase 6.14 — AI usage quota + logging + lightweight result cache.
 * Reuses one table (ai_requests) for all three purposes instead of
 * separate quota-counter / log / cache tables.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiAnalysisResult } from "./types";

const CACHE_WINDOW_MINUTES = 10;

export type AiRequestKind = "analyze" | "chat";

export async function checkAiQuota(
  admin: SupabaseClient,
  userId: string,
  kind: AiRequestKind,
  limit: number | null
): Promise<{ ok: boolean; used: number; limit: number | null }> {
  if (limit === null) return { ok: true, used: 0, limit: null };

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { count } = await admin
    .from("ai_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", kind)
    .eq("ok", true)
    .gte("created_at", monthStart.toISOString());

  const used = count ?? 0;
  return { ok: used < limit, used, limit };
}

export async function logAiRequest(
  admin: SupabaseClient,
  row: {
    user_id: string;
    kind: AiRequestKind;
    provider: string | null;
    model: string | null;
    device_id: string | null;
    period_days?: number | null;
    ok: boolean;
    error?: string | null;
    result?: AiAnalysisResult | null;
  }
): Promise<void> {
  await admin.from("ai_requests").insert({
    user_id: row.user_id,
    kind: row.kind,
    provider: row.provider,
    model: row.model,
    device_id: row.device_id,
    period_days: row.period_days ?? null,
    ok: row.ok,
    error: row.error ?? null,
    result: row.result ?? null,
  });
}

/**
 * Skips a repeat provider call when the user just ran the same single-device
 * analysis for the same period — must match period_days too, otherwise
 * switching "24h" -> "7d" would silently return the stale 24h result.
 */
export async function findCachedAnalysis(
  admin: SupabaseClient,
  userId: string,
  deviceId: string,
  periodDays: number
): Promise<{ result: AiAnalysisResult; provider: string | null; model: string | null } | null> {
  const since = new Date(Date.now() - CACHE_WINDOW_MINUTES * 60_000).toISOString();
  const { data } = await admin
    .from("ai_requests")
    .select("result, provider, model")
    .eq("user_id", userId)
    .eq("kind", "analyze")
    .eq("device_id", deviceId)
    .eq("period_days", periodDays)
    .eq("ok", true)
    .not("result", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.result) return null;
  return { result: data.result as AiAnalysisResult, provider: data.provider as string | null, model: data.model as string | null };
}
