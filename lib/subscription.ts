import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanId } from "@/lib/plans";

function isValidPlanId(x: string | null | undefined): x is PlanId {
  return x === "starter" || x === "pro" || x === "business" || x === "enterprise";
}

export type SubscriptionStatus = "active" | "grace" | "expired";

export type SubscriptionState = {
  set_plan: PlanId;
  effective_plan: PlanId;
  status: SubscriptionStatus;
  expires_at: string | null;
  grace_period_end: string | null;
  days_remaining: number | null;
  auto_renew: boolean;
};

const GRACE_DAYS = parseInt(process.env.SUBSCRIPTION_GRACE_DAYS ?? "7", 10) || 7;

/**
 * Resolve a user's subscription state.
 * - `starter` / `enterprise` (no expiry) are always active
 * - Paid plans past expiry enter `grace` for GRACE_DAYS, then `expired` (effective plan = starter)
 * The cron endpoint materializes state (writes `grace_period_end`, downgrades `plan`);
 * this resolver is safe to call before the cron has run.
 */
export async function getSubscriptionState(
  supabase: SupabaseClient,
  userId: string
): Promise<SubscriptionState> {
  const { data } = await supabase
    .from("profiles")
    .select("plan, plan_expires_at, grace_period_end, auto_renew")
    .eq("id", userId)
    .maybeSingle();

  const set_plan: PlanId = isValidPlanId(data?.plan) ? (data!.plan as PlanId) : "starter";
  const expires_at = (data?.plan_expires_at as string | null) ?? null;
  const stored_grace = (data?.grace_period_end as string | null) ?? null;
  const auto_renew = !!(data?.auto_renew as boolean | null);

  // Starter / enterprise have no expiry — always active
  if (set_plan === "starter" || set_plan === "enterprise" || !expires_at) {
    return {
      set_plan,
      effective_plan: set_plan,
      status: "active",
      expires_at,
      grace_period_end: stored_grace,
      days_remaining: null,
      auto_renew,
    };
  }

  const now = Date.now();
  const exp = new Date(expires_at).getTime();
  const days_remaining = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));

  if (exp > now) {
    return {
      set_plan,
      effective_plan: set_plan,
      status: "active",
      expires_at,
      grace_period_end: stored_grace,
      days_remaining,
      auto_renew,
    };
  }

  // Past expiry — compute effective grace end (materialized if cron ran, else derive)
  const grace_end_ms = stored_grace
    ? new Date(stored_grace).getTime()
    : exp + GRACE_DAYS * 24 * 60 * 60 * 1000;

  if (now <= grace_end_ms) {
    const days_remaining_in_grace = Math.ceil((grace_end_ms - now) / (1000 * 60 * 60 * 24));
    return {
      set_plan,
      effective_plan: set_plan, // grace still uses paid limits
      status: "grace",
      expires_at,
      grace_period_end: new Date(grace_end_ms).toISOString(),
      days_remaining: days_remaining_in_grace,
      auto_renew,
    };
  }

  return {
    set_plan,
    effective_plan: "starter", // past grace — enforce starter limits regardless of profile.plan
    status: "expired",
    expires_at,
    grace_period_end: new Date(grace_end_ms).toISOString(),
    days_remaining: 0,
    auto_renew,
  };
}

/** Human-readable Thai status label */
export function statusLabel(s: SubscriptionStatus): string {
  switch (s) {
    case "active": return "ใช้งานปกติ";
    case "grace": return "หมดอายุ (Grace Period)";
    case "expired": return "หมดอายุ";
  }
}
