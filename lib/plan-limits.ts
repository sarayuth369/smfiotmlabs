import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanId } from "@/lib/plans";

/** null = unlimited */
export type PlanLimits = {
  max_farms: number | null;
  max_zones: number | null;
  max_nodes: number | null;
  max_sensors: number | null;
  sensor_history_days: number | null;
};

/** Feature-flag map — extend keys freely; unknown keys default to false. */
export type PlanEntitlements = Record<string, boolean>;

export type UserPlan = {
  plan_id: PlanId;
  name: string;
  price: number;
  price_note: string | null;
  limits: PlanLimits;
  entitlements: PlanEntitlements;
};

/** Used only when subscription_plans row is missing / DB unreachable */
const FALLBACK_LIMITS: Record<PlanId, PlanLimits> = {
  starter: { max_farms: 1, max_zones: 2, max_nodes: 1, max_sensors: 5, sensor_history_days: 7 },
  pro: { max_farms: 5, max_zones: 20, max_nodes: 30, max_sensors: null, sensor_history_days: 90 },
  business: { max_farms: 20, max_zones: 100, max_nodes: 200, max_sensors: null, sensor_history_days: 365 },
  enterprise: { max_farms: null, max_zones: null, max_nodes: null, max_sensors: null, sensor_history_days: null },
};

const FALLBACK_ENTITLEMENTS: Record<PlanId, PlanEntitlements> = {
  starter: {},
  pro: { mqtt: true, line_notify: true, reports: true },
  business: { mqtt: true, line_notify: true, reports: true, ota: true, api: true, automation: true },
  enterprise: { mqtt: true, line_notify: true, reports: true, ota: true, api: true, automation: true },
};

const FALLBACK_META: Record<
  PlanId,
  { name: string; price: number; price_note: string | null }
> = {
  starter: { name: "Starter", price: 0, price_note: null },
  pro: { name: "Pro", price: 499, price_note: "/ เดือน" },
  business: { name: "Business", price: 899, price_note: "/ เดือน" },
  enterprise: { name: "Enterprise", price: 0, price_note: "Contact Sales" },
};

export function isValidPlanId(x: string | null | undefined): x is PlanId {
  return x === "starter" || x === "pro" || x === "business" || x === "enterprise";
}

/** Get user's plan (from profiles.plan, fallback = starter) + limits from DB */
export async function getUserPlan(
  supabase: SupabaseClient,
  userId: string
): Promise<UserPlan> {
  const { data: prof } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .maybeSingle();

  const planId: PlanId = isValidPlanId(prof?.plan as string | null | undefined)
    ? (prof!.plan as PlanId)
    : "starter";

  const { data: row } = await supabase
    .from("subscription_plans")
    .select("plan_id, name, price, price_note, max_farms, max_zones, max_nodes, max_sensors, sensor_history_days, entitlements")
    .eq("plan_id", planId)
    .maybeSingle();

  const meta = FALLBACK_META[planId];
  const fb = FALLBACK_LIMITS[planId];
  const fbEnt = FALLBACK_ENTITLEMENTS[planId];

  const entRaw = row?.entitlements as Record<string, unknown> | null | undefined;
  const entitlements: PlanEntitlements = {};
  if (entRaw && typeof entRaw === "object") {
    for (const [k, v] of Object.entries(entRaw)) entitlements[k] = !!v;
  } else {
    Object.assign(entitlements, fbEnt);
  }

  return {
    plan_id: planId,
    name: (row?.name as string | undefined) ?? meta.name,
    price: (row?.price as number | undefined) ?? meta.price,
    price_note: (row?.price_note as string | null | undefined) ?? meta.price_note,
    limits: {
      max_farms: row ? (row.max_farms as number | null) : fb.max_farms,
      max_zones: row ? (row.max_zones as number | null) : fb.max_zones,
      max_nodes: row ? (row.max_nodes as number | null) : fb.max_nodes,
      max_sensors: row ? (row.max_sensors as number | null) : fb.max_sensors,
      sensor_history_days: row
        ? (row.sensor_history_days as number | null)
        : fb.sensor_history_days,
    },
    entitlements,
  };
}

export function hasFeature(plan: UserPlan, key: string): boolean {
  return !!plan.entitlements[key];
}

/** Well-known feature-flag keys — extend list to expose new toggles in admin UI. */
export const KNOWN_FEATURES = [
  { key: "mqtt", label: "MQTT" },
  { key: "line_notify", label: "LINE Notify" },
  { key: "ota", label: "OTA Firmware" },
  { key: "api", label: "API Access" },
  { key: "reports", label: "Reports" },
  { key: "automation", label: "Automation" },
  { key: "ai", label: "AI Analysis" },
  { key: "priority_support", label: "Priority Support" },
] as const;

/** Counts only ACTIVE farms (archived_at IS NULL) — archived farms don't count against plan limit */
export async function getFarmUsage(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { count } = await supabase
    .from("farms")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("archived_at", null);
  return count ?? 0;
}

export type LimitCheck = {
  ok: boolean;
  current: number;
  limit: number | null; // null = unlimited
  planId: PlanId;
  planName: string;
  reason?: string;
};

export async function canCreateFarm(
  supabase: SupabaseClient,
  userId: string
): Promise<LimitCheck> {
  const [plan, current] = await Promise.all([
    getUserPlan(supabase, userId),
    getFarmUsage(supabase, userId),
  ]);
  const limit = plan.limits.max_farms;
  if (limit === null) {
    return { ok: true, current, limit: null, planId: plan.plan_id, planName: plan.name };
  }
  if (current >= limit) {
    return {
      ok: false,
      current,
      limit,
      planId: plan.plan_id,
      planName: plan.name,
      reason: `คุณใช้จำนวนฟาร์มครบตามแพ็กเกจ ${plan.name} แล้ว (${current}/${limit})`,
    };
  }
  return { ok: true, current, limit, planId: plan.plan_id, planName: plan.name };
}

/** Counts only ACTIVE zones across ALL farms of a user (archived zones don't count). */
export async function getZoneUsage(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data: farmIdsRow } = await supabase
    .from("farms")
    .select("id")
    .eq("user_id", userId);
  const farmIds = (farmIdsRow ?? []).map((f) => f.id as string);
  if (farmIds.length === 0) return 0;
  const { count } = await supabase
    .from("zones")
    .select("id", { count: "exact", head: true })
    .in("farm_id", farmIds)
    .is("archived_at", null);
  return count ?? 0;
}

export async function canCreateZone(
  supabase: SupabaseClient,
  userId: string
): Promise<LimitCheck> {
  const [plan, current] = await Promise.all([
    getUserPlan(supabase, userId),
    getZoneUsage(supabase, userId),
  ]);
  const limit = plan.limits.max_zones;
  if (limit === null) {
    return { ok: true, current, limit: null, planId: plan.plan_id, planName: plan.name };
  }
  if (current >= limit) {
    return {
      ok: false,
      current,
      limit,
      planId: plan.plan_id,
      planName: plan.name,
      reason: `คุณใช้จำนวนแปลงครบตามแพ็กเกจ ${plan.name} แล้ว (${current}/${limit})`,
    };
  }
  return { ok: true, current, limit, planId: plan.plan_id, planName: plan.name };
}

/** Counts only ACTIVE nodes across ALL farms of a user. */
export async function getNodeUsage(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data: farmIdsRow } = await supabase
    .from("farms")
    .select("id")
    .eq("user_id", userId);
  const farmIds = (farmIdsRow ?? []).map((f) => f.id as string);
  if (farmIds.length === 0) return 0;
  const { count } = await supabase
    .from("iot_nodes")
    .select("id", { count: "exact", head: true })
    .in("farm_id", farmIds)
    .is("archived_at", null);
  return count ?? 0;
}

export async function canCreateNode(
  supabase: SupabaseClient,
  userId: string
): Promise<LimitCheck> {
  const [plan, current] = await Promise.all([
    getUserPlan(supabase, userId),
    getNodeUsage(supabase, userId),
  ]);
  const limit = plan.limits.max_nodes;
  if (limit === null) {
    return { ok: true, current, limit: null, planId: plan.plan_id, planName: plan.name };
  }
  if (current >= limit) {
    return {
      ok: false,
      current,
      limit,
      planId: plan.plan_id,
      planName: plan.name,
      reason: `คุณใช้จำนวนอุปกรณ์ครบตามแพ็กเกจ ${plan.name} แล้ว (${current}/${limit})`,
    };
  }
  return { ok: true, current, limit, planId: plan.plan_id, planName: plan.name };
}

/** Counts ACTIVE sensors across ALL devices in ALL farms of a user. */
export async function getSensorUsage(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data: farmIdsRow } = await supabase
    .from("farms")
    .select("id")
    .eq("user_id", userId);
  const farmIds = (farmIdsRow ?? []).map((f) => f.id as string);
  if (farmIds.length === 0) return 0;
  const { data: nodeIdsRow } = await supabase
    .from("iot_nodes")
    .select("id")
    .in("farm_id", farmIds);
  const nodeIds = (nodeIdsRow ?? []).map((n) => n.id as string);
  if (nodeIds.length === 0) return 0;
  const { count } = await supabase
    .from("sensors")
    .select("id", { count: "exact", head: true })
    .in("device_id", nodeIds)
    .is("archived_at", null);
  return count ?? 0;
}

export async function canCreateSensor(
  supabase: SupabaseClient,
  userId: string
): Promise<LimitCheck> {
  const [plan, current] = await Promise.all([
    getUserPlan(supabase, userId),
    getSensorUsage(supabase, userId),
  ]);
  const limit = plan.limits.max_sensors;
  if (limit === null) {
    return { ok: true, current, limit: null, planId: plan.plan_id, planName: plan.name };
  }
  if (current >= limit) {
    return {
      ok: false,
      current,
      limit,
      planId: plan.plan_id,
      planName: plan.name,
      reason: `คุณใช้จำนวน Sensor ครบตามแพ็กเกจ ${plan.name} แล้ว (${current}/${limit})`,
    };
  }
  return { ok: true, current, limit, planId: plan.plan_id, planName: plan.name };
}

export function formatPlanLabel(plan: UserPlan): string {
  if (plan.plan_id === "starter" && plan.price === 0) return "ฟรี";
  if (plan.plan_id === "enterprise") return plan.price_note ?? "Contact Sales";
  const note = plan.price_note ?? "/ เดือน";
  return `฿${plan.price.toLocaleString()} ${note}`;
}

export function formatLimit(n: number | null): string {
  return n === null ? "ไม่จำกัด" : n.toLocaleString();
}

/** clamp progress-bar 0..100 (returns 100 for unlimited so bar visually "safe") */
export function usagePercent(current: number, limit: number | null): number {
  if (limit === null || limit <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((current / limit) * 100)));
}
