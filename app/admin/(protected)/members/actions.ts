"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";

const PLANS = ["starter", "pro", "business", "enterprise"] as const;
type Plan = (typeof PLANS)[number];

function isValidPlan(x: string): x is Plan {
  return (PLANS as readonly string[]).includes(x);
}

export async function updateMember(userId: string, formData: FormData): Promise<void> {
  await requireModule("members");

  const full_name = String(formData.get("full_name") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const planRaw = String(formData.get("plan") ?? "");
  const expiryRaw = String(formData.get("plan_expires_at") ?? "").trim();

  if (!isValidPlan(planRaw)) {
    console.warn("[admin.members.update] invalid plan", planRaw);
    return;
  }

  const update: Record<string, unknown> = {
    full_name,
    phone,
    plan: planRaw,
  };

  // datetime-local sends "YYYY-MM-DDTHH:MM" (local time, no timezone)
  if (expiryRaw) {
    const dt = new Date(expiryRaw);
    if (!isNaN(dt.getTime())) update.plan_expires_at = dt.toISOString();
  } else {
    update.plan_expires_at = null;
  }

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update(update).eq("id", userId);
  if (error) console.warn("[admin.members.update] db error", error);

  revalidatePath("/admin/members");
}

export async function deleteMember(userId: string): Promise<void> {
  await requireModule("members");

  const admin = createAdminClient();
  // Deletes auth.users row; profiles cascades via FK on delete cascade
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) console.warn("[admin.members.delete] auth error", error);

  revalidatePath("/admin/members");
}
