/**
 * Phase 6.13 — auth/authorization for /api/v1/* customer-facing routes.
 *
 * These routes are called by external clients with an API key, never a
 * Supabase session — every check here runs against the service-role
 * (admin) client and enforces authorization in application code, the same
 * way /api/telemetry/ingest already does for the device-facing side.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashApiKey } from "@/lib/api-keys";
import { getUserPlan, hasFeature, type UserPlan } from "@/lib/plan-limits";
import { checkApiKeyRateLimit } from "@/lib/rate-limit";

export const PERMISSIONS = [
  "READ_DEVICES",
  "READ_STATUS",
  "READ_SENSORS",
  "READ_READINGS",
  "CONTROL_DEVICES",
  "WEBHOOK_MANAGE",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Permissions an API key may hold without the "api_control" (Business+) entitlement. */
export const READ_ONLY_PERMISSIONS: Permission[] = ["READ_DEVICES", "READ_STATUS", "READ_SENSORS", "READ_READINGS"];
export const CONTROL_PERMISSIONS: Permission[] = ["CONTROL_DEVICES", "WEBHOOK_MANAGE"];

export type ApiAuthContext = {
  admin: SupabaseClient;
  userId: string;
  apiKeyId: string;
  permissions: Permission[];
  scopeDeviceIds: string[] | null; // null = all devices on the account
  plan: UserPlan;
};

export type ApiAuthError = { ok: false; status: number; error: string; retryAfterSec?: number };
export type ApiAuthResult = { ok: true; ctx: ApiAuthContext } | ApiAuthError;

function fail(status: number, error: string, retryAfterSec?: number): ApiAuthError {
  return { ok: false, status, error, retryAfterSec };
}

/** Every /api/v1 route handler should return this for a failed auth/permission check — carries the retry-after header through for 429s. */
export function apiErrorResponse(err: ApiAuthError): Response {
  const headers = err.retryAfterSec !== undefined ? { "retry-after": String(err.retryAfterSec) } : undefined;
  return Response.json({ error: err.error }, { status: err.status, headers });
}

/** Authenticates the Bearer API key, resolves plan + rate limit + permissions. Call first in every /api/v1 handler. */
export async function authenticateApiRequest(req: Request): Promise<ApiAuthResult> {
  const authz = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/.exec(authz);
  if (!match) return fail(401, "missing or malformed Authorization header — expected 'Bearer <API_KEY>'");

  const plaintext = match[1];
  if (!plaintext.startsWith("smf_")) return fail(401, "invalid API key");

  const admin = createAdminClient();
  const keyHash = hashApiKey(plaintext);

  const { data: row } = await admin
    .from("api_keys")
    .select("id, user_id, permissions, scope_device_ids, revoked_at")
    .eq("key_hash", keyHash)
    .maybeSingle();

  // Same generic message whether the key never existed or was revoked —
  // avoids letting a caller enumerate which keys are valid-but-revoked.
  if (!row || row.revoked_at) return fail(401, "invalid API key");

  const { data: profile } = await admin
    .from("profiles")
    .select("account_status")
    .eq("id", row.user_id as string)
    .maybeSingle();
  if (profile?.account_status === "suspended") return fail(403, "account suspended");

  const plan = await getUserPlan(admin, row.user_id as string);
  if (!hasFeature(plan, "api")) return fail(403, "API Access is not available on your current plan");

  const limitPerMin = plan.limits.api_rate_limit_per_min;
  if (limitPerMin !== null) {
    const rl = await checkApiKeyRateLimit(row.id as string, limitPerMin);
    if (!rl.ok) {
      return fail(429, `rate limit exceeded — retry after ${rl.retryAfterSec}s`, rl.retryAfterSec);
    }
  }

  // Best-effort — never block the request on this write failing.
  void admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", row.id as string);

  return {
    ok: true,
    ctx: {
      admin,
      userId: row.user_id as string,
      apiKeyId: row.id as string,
      permissions: (row.permissions as Permission[]) ?? [],
      scopeDeviceIds: (row.scope_device_ids as string[] | null) ?? null,
      plan,
    },
  };
}

export function requirePermission(ctx: ApiAuthContext, permission: Permission): ApiAuthError | null {
  if (!ctx.permissions.includes(permission)) {
    return fail(403, `API key is missing required permission: ${permission}`);
  }
  if (CONTROL_PERMISSIONS.includes(permission) && !hasFeature(ctx.plan, "api_control")) {
    // Defense in depth — a key issued while on Business could still hold
    // this permission after a downgrade; the entitlement wins either way.
    return fail(403, "Control API / Webhooks are not available on your current plan");
  }
  return null;
}

/**
 * Resolves + authorizes one device for this API key: must belong to the
 * key owner's account, and (if the key is scoped) must be in scope.
 * Mirrors the iot_nodes -> farms!inner(user_id) ownership pattern used
 * throughout the dashboard, just keyed by the API key's userId instead of
 * a session's user.id.
 */
export async function resolveScopedDevice(
  ctx: ApiAuthContext,
  deviceId: string
): Promise<{ ok: true; device: { id: string; device_uid: string; device_name: string; farm_id: string; status: string; last_seen: string | null } } | ApiAuthError> {
  if (ctx.scopeDeviceIds && !ctx.scopeDeviceIds.includes(deviceId)) {
    return fail(403, "API key is not scoped to this device");
  }

  const { data } = await ctx.admin
    .from("iot_nodes")
    .select("id, device_uid, device_name, farm_id, status, last_seen, archived_at, farms!inner(user_id)")
    .eq("id", deviceId)
    .maybeSingle();

  const farmRel = (data as unknown as { farms: { user_id: string } | { user_id: string }[] } | null)?.farms;
  const ownerId = Array.isArray(farmRel) ? farmRel[0]?.user_id : farmRel?.user_id;
  if (!data || ownerId !== ctx.userId || data.archived_at) {
    return fail(404, "device not found");
  }

  return {
    ok: true,
    device: {
      id: data.id as string,
      device_uid: data.device_uid as string,
      device_name: data.device_name as string,
      farm_id: data.farm_id as string,
      status: data.status as string,
      last_seen: data.last_seen as string | null,
    },
  };
}

/** All device ids on this account, respecting key scope — used by list endpoints. */
export async function resolveScopedDeviceIds(ctx: ApiAuthContext): Promise<string[]> {
  const { data: farmIdsRow } = await ctx.admin.from("farms").select("id").eq("user_id", ctx.userId);
  const farmIds = (farmIdsRow ?? []).map((f) => f.id as string);
  if (farmIds.length === 0) return [];

  const { data } = await ctx.admin.from("iot_nodes").select("id").in("farm_id", farmIds).is("archived_at", null);
  const allIds = (data ?? []).map((r) => r.id as string);

  if (!ctx.scopeDeviceIds) return allIds;
  const scoped = new Set(ctx.scopeDeviceIds);
  return allIds.filter((id) => scoped.has(id));
}

export async function logApiEvent(
  admin: SupabaseClient,
  userId: string,
  apiKeyId: string | null,
  eventType: string,
  detail: Record<string, unknown> | null,
  ip: string | null
): Promise<void> {
  await admin.from("api_audit_logs").insert({
    user_id: userId,
    api_key_id: apiKeyId,
    event_type: eventType,
    detail,
    ip,
  });
}
