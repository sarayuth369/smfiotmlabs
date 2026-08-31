import type { SupabaseClient } from "@supabase/supabase-js";
import { getSubscriptionState } from "@/lib/subscription";

/**
 * In-memory (per-instance, no Redis) cache of "is this device's owner
 * entitled to ingest telemetry right now" — used by the telemetry ingest
 * route so a Starter Free expiry check isn't a Supabase round trip on
 * every single packet.
 *
 * TTL = 60s: matches DEVICE_OFFLINE_THRESHOLD_SEC used elsewhere in this
 * codebase (lib/device-status.ts) — short enough that a free renewal
 * unblocks ingestion within roughly one heartbeat cycle, long enough to
 * avoid a subscription lookup per packet. Vercel serverless instances are
 * short-lived and multiple may run concurrently, so this is a best-effort
 * cache, not a strict single source of truth — the TTL alone bounds
 * staleness, which is the explicitly accepted tradeoff (no shared cache
 * store needed).
 */
const TTL_MS = 60_000;

type Entry = { active: boolean; expiresAtMs: number };
const cache = new Map<string, Entry>();

/** Keyed by device id (not user id) — the ingest route already has
 *  device_id resolved, and this avoids an extra farm->user join on a
 *  cache hit. */
export async function isDeviceEntitledToIngest(
  admin: SupabaseClient,
  deviceId: string,
  farmId: string
): Promise<boolean> {
  const cached = cache.get(deviceId);
  if (cached && Date.now() < cached.expiresAtMs) return cached.active;

  // Fail-open: an infra hiccup resolving the owner should never silently
  // drop a paying/active customer's telemetry.
  let active = true;
  try {
    const { data: farm } = await admin
      .from("farms")
      .select("user_id")
      .eq("id", farmId)
      .maybeSingle();
    if (farm?.user_id) {
      const sub = await getSubscriptionState(admin, farm.user_id as string);
      active = sub.status !== "expired";
    }
  } catch (e) {
    console.warn("[subscription-cache] resolve error", deviceId, (e as Error).message);
  }

  cache.set(deviceId, { active, expiresAtMs: Date.now() + TTL_MS });
  return active;
}
