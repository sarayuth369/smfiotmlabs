import type { SupabaseClient } from "@supabase/supabase-js";
import { getSubscriptionState } from "@/lib/subscription";

/**
 * In-memory (per-instance, no Redis) cache of "is this device's owner
 * entitled to ingest telemetry right now" — used by the telemetry ingest
 * route so neither the Starter Free expiry check nor the admin-suspension
 * check is a Supabase round trip on every single packet.
 *
 * Entitlement = account_status !== 'suspended' AND subscription effectively
 * active (see lib/subscription.ts).
 *
 * TTL = 60s: matches DEVICE_OFFLINE_THRESHOLD_SEC used elsewhere in this
 * codebase (lib/device-status.ts) — short enough that a free renewal or an
 * admin unsuspend unblocks ingestion within roughly one heartbeat cycle,
 * long enough to avoid a subscription lookup per packet. Vercel serverless
 * instances are short-lived and multiple may run concurrently, so this is a
 * best-effort cache, not a strict single source of truth — invalidateUser
 * below clears it immediately on the *current* instance (helps the common
 * case), but 60s is the documented worst-case bound across all instances.
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
      const userId = farm.user_id as string;
      const [{ data: profile }, sub] = await Promise.all([
        admin.from("profiles").select("account_status").eq("id", userId).maybeSingle(),
        getSubscriptionState(admin, userId),
      ]);
      const suspended = profile?.account_status === "suspended";
      active = !suspended && sub.status !== "expired";
    }
  } catch (e) {
    console.warn("[subscription-cache] resolve error", deviceId, (e as Error).message);
  }

  cache.set(deviceId, { active, expiresAtMs: Date.now() + TTL_MS });
  return active;
}

/**
 * Best-effort immediate cache clear for every device owned by a user —
 * called right after an admin suspend/unsuspend. Only clears this
 * particular serverless instance's memory; other warm instances still
 * serve their own cached value until it naturally expires, bounded by
 * TTL_MS above. Never throws — invalidation failing must not fail the
 * suspend/unsuspend action itself (the DB write already succeeded).
 */
export async function invalidateUserEntitlementCache(
  admin: SupabaseClient,
  userId: string
): Promise<void> {
  try {
    const { data: farmIdsRow } = await admin.from("farms").select("id").eq("user_id", userId);
    const farmIds = (farmIdsRow ?? []).map((f) => f.id as string);
    if (farmIds.length === 0) return;
    const { data: nodeIdsRow } = await admin.from("iot_nodes").select("id").in("farm_id", farmIds);
    for (const n of nodeIdsRow ?? []) cache.delete(n.id as string);
  } catch (e) {
    console.warn("[subscription-cache] invalidate error", userId, (e as Error).message);
  }
}
