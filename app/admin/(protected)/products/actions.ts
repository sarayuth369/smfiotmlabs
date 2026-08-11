"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";

export async function updateProduct(sku: string, formData: FormData): Promise<void> {
  await requireModule("products");
  if (!["starter_node", "pro_node", "complete_kit"].includes(sku)) return;

  const name = String(formData.get("name") ?? "").trim();
  const price = Number(formData.get("price") ?? 0);
  const badge = String(formData.get("badge") ?? "").trim() || null;
  const badge_tier = String(formData.get("badge_tier") ?? "").trim() || null;
  const audience = String(formData.get("audience") ?? "")
    .split("\n").map((s) => s.trim()).filter(Boolean);
  const specs = String(formData.get("specs") ?? "")
    .split("\n").map((s) => s.trim()).filter(Boolean);
  const sort_order = Number(formData.get("sort_order") ?? 0);
  const is_active = formData.get("is_active") === "on";

  const admin = createAdminClient();
  const { error } = await admin
    .from("products")
    .upsert({
      sku, name, price, badge, badge_tier, audience, specs, sort_order, is_active,
      updated_at: new Date().toISOString(),
    }, { onConflict: "sku" });
  if (error) console.warn("[products.updateProduct] db error", error);

  revalidatePath("/iot-nodes");
  revalidatePath("/admin/products");
}
