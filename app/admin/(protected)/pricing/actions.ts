"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";

export async function updatePlan(planId: string, formData: FormData) {
  await requireModule("pricing");
  if (!["starter", "pro", "business", "enterprise"].includes(planId)) {
    return { ok: false, error: "Invalid plan" } as const;
  }

  const name = String(formData.get("name") ?? "").trim();
  const price = Number(formData.get("price") ?? 0);
  const price_note = String(formData.get("price_note") ?? "").trim() || null;
  const badge = String(formData.get("badge") ?? "").trim() || null;
  const audience = String(formData.get("audience") ?? "")
    .split("\n").map((s) => s.trim()).filter(Boolean);
  const features = String(formData.get("features") ?? "")
    .split("\n").map((s) => s.trim()).filter(Boolean);
  const sort_order = Number(formData.get("sort_order") ?? 0);
  const is_active = formData.get("is_active") === "on";

  const admin = createAdminClient();
  const { error } = await admin
    .from("subscription_plans")
    .upsert({
      plan_id: planId,
      name, price, price_note, badge, audience, features, sort_order, is_active,
      updated_at: new Date().toISOString(),
    }, { onConflict: "plan_id" });

  if (error) return { ok: false, error: error.message } as const;

  revalidatePath("/pricing");
  revalidatePath("/admin/pricing");
  return { ok: true } as const;
}
