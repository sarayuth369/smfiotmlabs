"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PLAN_INFO, type PlanId } from "@/lib/plans";

export type UpgradeResult =
  | { ok: true; newPlan: PlanId }
  | { ok: false; error: string };

/**
 * Demo-mode upgrade:
 *   - Records a payment_request row
 *   - Immediately updates profile.plan for a smooth demo
 * Production TODO — remove the immediate plan bump and gate it on a real
 * payment webhook / admin verification.
 */
export async function requestUpgrade(plan: "pro" | "business"): Promise<UpgradeResult> {
  if (plan !== "pro" && plan !== "business") {
    return { ok: false, error: "Invalid plan" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "กรุณาเข้าสู่ระบบก่อน" };

  const amount = PLAN_INFO[plan].price;

  const { error: insertErr } = await supabase.from("payment_requests").insert({
    user_id: user.id,
    plan,
    amount,
    method: "promptpay",
    status: "pending",
  });
  if (insertErr) return { ok: false, error: insertErr.message };

  // Demo: instant activation
  const { error: updateErr } = await supabase
    .from("profiles")
    .update({ plan })
    .eq("id", user.id);
  if (updateErr) return { ok: false, error: updateErr.message };

  revalidatePath("/dashboard");
  revalidatePath("/pricing");
  return { ok: true, newPlan: plan };
}
