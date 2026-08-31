"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RenewResult = { ok: true; expiresAt: string } | { ok: false; error: string };

/**
 * Free self-service renewal for Starter Free — only allowed once the plan
 * has actually expired. The server computes plan/expiry; the client sends
 * no parameters at all, so there's nothing for it to forge. The WHERE
 * clause (`plan = starter AND plan_expires_at <= now`) makes the update
 * atomic and race-safe: a double-click / concurrent call only lets the
 * first request's UPDATE match — the second finds the row already moved
 * to a future expiry and matches zero rows, returning the "not expired"
 * message instead of stacking another year on top.
 */
export async function renewStarterFree(): Promise<RenewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "กรุณาเข้าสู่ระบบก่อน" };

  const nowIso = new Date().toISOString();
  const nextExpiry = new Date();
  nextExpiry.setFullYear(nextExpiry.getFullYear() + 1);
  const nextExpiryIso = nextExpiry.toISOString();

  const { data, error } = await supabase
    .from("profiles")
    .update({ plan: "starter", plan_expires_at: nextExpiryIso })
    .eq("id", user.id)
    .eq("plan", "starter")
    .lte("plan_expires_at", nowIso)
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "แพ็กเกจของคุณยังไม่หมดอายุ — ต่ออายุฟรีได้เมื่อหมดอายุแล้วเท่านั้น" };
  }

  try {
    await supabase.from("subscription_events").insert({
      user_id: user.id,
      event_type: "renewed",
      from_plan: "starter",
      to_plan: "starter",
      actor_type: "user",
      metadata: { expires_at: nextExpiryIso, free: true },
    });
  } catch (e) {
    console.warn("[renewStarterFree] event log failed", (e as Error).message);
  }

  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard");
  return { ok: true, expiresAt: nextExpiryIso };
}
