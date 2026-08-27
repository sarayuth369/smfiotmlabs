import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanId } from "@/lib/plans";
import { getSubscriptionState } from "@/lib/subscription";

/** null = unlimited */
export type PlanLimits = {
  max_farms: number | null;
  max_zones: number | null;
  max_nodes: number | null;
  max_sensors: number | null;
  max_relays: number | null;
  sensor_history_days: number | null;
  max_api_keys: number | null;
  api_rate_limit_per_min: number | null;
  max_ai_analyses_per_month: number | null;
  max_ai_chat_per_month: number | null;
  max_automation_rules: number | null;
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
  starter: { max_farms: 1, max_zones: 2, max_nodes: 1, max_sensors: 5, max_relays: 2, sensor_history_days: 7, max_api_keys: 0, api_rate_limit_per_min: 0, max_ai_analyses_per_month: 0, max_ai_chat_per_month: 0, max_automation_rules: 0 },
  pro: { max_farms: 5, max_zones: 20, max_nodes: 30, max_sensors: null, max_relays: 4, sensor_history_days: 90, max_api_keys: 3, api_rate_limit_per_min: 60, max_ai_analyses_per_month: 30, max_ai_chat_per_month: 60, max_automation_rules: 10 },
  business: { max_farms: 20, max_zones: 100, max_nodes: 200, max_sensors: null, max_relays: 8, sensor_history_days: 365, max_api_keys: 10, api_rate_limit_per_min: 300, max_ai_analyses_per_month: 150, max_ai_chat_per_month: 300, max_automation_rules: 50 },
  enterprise: { max_farms: null, max_zones: null, max_nodes: null, max_sensors: null, max_relays: null, sensor_history_days: null, max_api_keys: 25, api_rate_limit_per_min: 600, max_ai_analyses_per_month: null, max_ai_chat_per_month: null, max_automation_rules: null },
};

const FALLBACK_ENTITLEMENTS: Record<PlanId, PlanEntitlements> = {
  starter: { reports: true, rules: true, sheets_export: true, csv_export: true, api: false, api_control: false, ai: false, ai_advanced: false, automation: false },
  pro: { line_notify: true, reports: true, rules: true, sheets_export: true, csv_export: true, api: true, api_control: false, ai: true, ai_advanced: false, automation: true },
  business: {
    line_notify: true,
    reports: true,
    ota: true,
    api: true,
    api_control: true,
    automation: true,
    rules: true,
    sheets_export: true,
    csv_export: true,
    ai: true,
    ai_advanced: true,
  },
  enterprise: {
    line_notify: true,
    reports: true,
    ota: true,
    api: true,
    api_control: true,
    automation: true,
    rules: true,
    sheets_export: true,
    csv_export: true,
    ai: true,
    ai_advanced: true,
  },
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

/**
 * Get user's EFFECTIVE plan + limits from DB.
 * If subscription is past grace period, returns `starter` regardless of `profiles.plan`
 * — enforced server-side, cannot be bypassed by client.
 */
export async function getUserPlan(
  supabase: SupabaseClient,
  userId: string
): Promise<UserPlan> {
  const sub = await getSubscriptionState(supabase, userId);
  const planId: PlanId = sub.effective_plan;

  const { data: row } = await supabase
    .from("subscription_plans")
    .select(
      "plan_id, name, price, price_note, max_farms, max_zones, max_nodes, max_sensors, max_relays, sensor_history_days, max_api_keys, api_rate_limit_per_min, max_ai_analyses_per_month, max_ai_chat_per_month, max_automation_rules, entitlements"
    )
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
      max_relays: row ? (row.max_relays as number | null) : fb.max_relays,
      sensor_history_days: row
        ? (row.sensor_history_days as number | null)
        : fb.sensor_history_days,
      max_api_keys: row ? (row.max_api_keys as number | null) : fb.max_api_keys,
      api_rate_limit_per_min: row ? (row.api_rate_limit_per_min as number | null) : fb.api_rate_limit_per_min,
      max_ai_analyses_per_month: row ? (row.max_ai_analyses_per_month as number | null) : fb.max_ai_analyses_per_month,
      max_ai_chat_per_month: row ? (row.max_ai_chat_per_month as number | null) : fb.max_ai_chat_per_month,
      max_automation_rules: row ? (row.max_automation_rules as number | null) : fb.max_automation_rules,
    },
    entitlements,
  };
}

export function hasFeature(plan: UserPlan, key: string): boolean {
  return !!plan.entitlements[key];
}

/** Well-known feature-flag keys — extend list to expose new toggles in admin UI. */
export const KNOWN_FEATURES = [
  { key: "line_notify", label: "LINE Notify" },
  { key: "sheets_export", label: "บันทึกลง Google Sheet" },
  { key: "ota", label: "OTA Firmware" },
  { key: "api", label: "API Access" },
  { key: "api_control", label: "API Control + Webhook" },
  { key: "reports", label: "Reports" },
  { key: "automation", label: "Automation" },
  { key: "rules", label: "Rules" },
  { key: "csv_export", label: "Export CSV" },
  { key: "ai", label: "AI Analysis" },
  { key: "ai_advanced", label: "AI Analysis (Advanced)" },
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

/** Counts ACTIVE sensors across ALL ACTIVE devices in ALL farms of a user.
 *  Excludes sensors whose parent device is archived (defense in depth —
 *  archiveDevice cascades, but old data may still have orphans). */
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
    .in("farm_id", farmIds)
    .is("archived_at", null);
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

/** Counts ACTIVE relay controls across ALL ACTIVE devices in ALL farms of
 *  a user. This governs how many named relay-control entries the account
 *  may configure across its fleet — independent of the fixed 4 physical
 *  channels per ESP32-S3 relay board (relay_model.dart is the single
 *  source of truth for that hardware constant). A Business/Enterprise
 *  account with several devices needs more total relay slots than a
 *  Starter account with one device, exactly like max_sensors already
 *  works relative to per-device sensor wiring. */
export async function getRelayUsage(
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
    .in("farm_id", farmIds)
    .is("archived_at", null);
  const nodeIds = (nodeIdsRow ?? []).map((n) => n.id as string);
  if (nodeIds.length === 0) return 0;
  const { count } = await supabase
    .from("relays")
    .select("id", { count: "exact", head: true })
    .in("device_id", nodeIds)
    .is("archived_at", null);
  return count ?? 0;
}

export async function canCreateRelay(
  supabase: SupabaseClient,
  userId: string
): Promise<LimitCheck> {
  const [plan, current] = await Promise.all([
    getUserPlan(supabase, userId),
    getRelayUsage(supabase, userId),
  ]);
  const limit = plan.limits.max_relays;
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
      reason: `คุณใช้จำนวน Relay ครบตามแพ็กเกจ ${plan.name} แล้ว (${current}/${limit})`,
    };
  }
  return { ok: true, current, limit, planId: plan.plan_id, planName: plan.name };
}

/** Counts ALL automation_rules owned by the user (enabled + disabled both count against quota). */
export async function getAutomationUsage(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { count } = await supabase
    .from("automation_rules")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return count ?? 0;
}

export async function canCreateAutomation(
  supabase: SupabaseClient,
  userId: string
): Promise<LimitCheck> {
  const [plan, current] = await Promise.all([
    getUserPlan(supabase, userId),
    getAutomationUsage(supabase, userId),
  ]);
  if (!hasFeature(plan, "automation")) {
    return { ok: false, current, limit: 0, planId: plan.plan_id, planName: plan.name, reason: `แพ็กเกจ ${plan.name} ไม่รองรับ Automation` };
  }
  const limit = plan.limits.max_automation_rules;
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
      reason: `คุณใช้จำนวน Automation ครบตามแพ็กเกจ ${plan.name} แล้ว (${current}/${limit})`,
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
