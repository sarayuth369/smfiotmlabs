"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";
import { KNOWN_FEATURES } from "@/lib/plan-limits";

const PLAN_IDS = ["starter", "pro", "business", "enterprise"] as const;
type PlanId = (typeof PLAN_IDS)[number];

/** Parse int limit field. "unlimited" checkbox → null. Empty/invalid → null. */
function parseLimit(fd: FormData, field: string, minDefaultForFinite: number = 0): number | null {
  if (fd.get(`${field}__unlimited`) === "on") return null;
  const raw = String(fd.get(field) ?? "").trim();
  if (raw === "") return null;
  const n = Number(raw);
  if (isNaN(n) || n < minDefaultForFinite) throw new Error(`ค่า ${field} ต้องเป็นตัวเลข >= ${minDefaultForFinite}`);
  return Math.floor(n);
}

export async function updatePlanLimits(planId: string, formData: FormData): Promise<void> {
  await requireModule("plan_limits");

  if (!(PLAN_IDS as readonly string[]).includes(planId)) return;

  const max_farms = parseLimit(formData, "max_farms", 0);
  const max_zones = parseLimit(formData, "max_zones", 0);
  const max_nodes = parseLimit(formData, "max_nodes", 0);
  const max_sensors = parseLimit(formData, "max_sensors", 0);
  const sensor_history_days = parseLimit(formData, "sensor_history_days", 1);

  const entitlements: Record<string, boolean> = {};
  for (const f of KNOWN_FEATURES) {
    entitlements[f.key] = formData.get(`feat__${f.key}`) === "on";
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("subscription_plans")
    .update({
      max_farms,
      max_zones,
      max_nodes,
      max_sensors,
      sensor_history_days,
      entitlements,
      updated_at: new Date().toISOString(),
    })
    .eq("plan_id", planId);
  if (error) console.warn("[admin.plan-limits.update] db error", error);

  // Public pricing page + user dashboard both read from subscription_plans
  revalidatePath("/admin/plan-limits");
  revalidatePath("/admin/pricing");
  revalidatePath("/pricing");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/farms");
}
