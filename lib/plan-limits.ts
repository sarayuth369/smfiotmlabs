import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanId } from "@/lib/plans";

/** null = unlimited */
export type PlanLimits = {
  max_farms: number | null;
  max_zones: number | null;
  max_nodes: number | null;
  max_sensors: number | null;
};

export type UserPlan = {
  plan_id: PlanId;
  name: string;
  price: number;
  price_note: string | null;
  limits: PlanLimits;
};

/** Used only when subscription_plans row is missing / DB unreachable */
const FALLBACK_LIMITS: Record<PlanId, PlanLimits> = {
  starter: { max_farms: 1, max_zones: 2, max_nodes: 1, max_sensors: 1 },
  pro: { max_farms: 5, max_zones: 10, max_nodes: 10, max_sensors: 50 },
  business: { max_farms: 20, max_zones: 50, max_nodes: 50, max_sensors: 200 },
  enterprise: { max_farms: null, max_zones: null, max_nodes: null, max_sensors: null },
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
    .select("plan_id, name, price, price_note, max_farms, max_zones, max_nodes, max_sensors")
    .eq("plan_id", planId)
    .maybeSingle();

  const meta = FALLBACK_META[planId];
  const fb = FALLBACK_LIMITS[planId];

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
    },
  };
}

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
