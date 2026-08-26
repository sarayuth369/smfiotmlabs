"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";

function slugify(label: string): string {
  return (
    label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "sensor"
  );
}

function revalidateAll(): void {
  revalidatePath("/admin/sensors");
  revalidatePath("/dashboard");
}

export async function createSensorType(formData: FormData): Promise<void> {
  await requireModule("sensors");

  const label = String(formData.get("label") ?? "").trim();
  const icon = String(formData.get("icon") ?? "").trim() || "📊";
  const unit = String(formData.get("unit") ?? "").trim();
  if (!label) throw new Error("กรุณากรอกชื่อประเภท Sensor");

  const admin = createAdminClient();

  let key = slugify(label);
  const { data: existing } = await admin.from("sensor_type_catalog").select("key").like("key", `${key}%`);
  const existingKeys = new Set((existing ?? []).map((r) => r.key as string));
  if (existingKeys.has(key)) {
    let n = 2;
    while (existingKeys.has(`${key}_${n}`)) n++;
    key = `${key}_${n}`;
  }

  const { data: maxRow } = await admin
    .from("sensor_type_catalog")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = ((maxRow?.sort_order as number | undefined) ?? 0) + 1;

  const { error } = await admin
    .from("sensor_type_catalog")
    .insert({ key, label, icon, default_unit: unit, sort_order: nextSort });
  if (error) throw new Error(error.message);

  revalidateAll();
}

export async function updateSensorType(id: string, formData: FormData): Promise<void> {
  await requireModule("sensors");

  const label = String(formData.get("label") ?? "").trim();
  const icon = String(formData.get("icon") ?? "").trim() || "📊";
  const unit = String(formData.get("unit") ?? "").trim();
  if (!label) throw new Error("กรุณากรอกชื่อประเภท Sensor");

  const admin = createAdminClient();
  const { error } = await admin
    .from("sensor_type_catalog")
    .update({ label, icon, default_unit: unit, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidateAll();
}

/** Blocks delete if any customer's sensor (any tenant — checked via the
 * service-role client, not the RLS-scoped one) still uses this key, so
 * deleting a type from the catalog can never orphan live sensor rows. */
export async function deleteSensorType(id: string, key: string): Promise<void> {
  await requireModule("sensors");

  const admin = createAdminClient();

  const { count } = await admin.from("sensors").select("id", { count: "exact", head: true }).eq("sensor_type", key);
  if ((count ?? 0) > 0) {
    throw new Error(`ลบไม่ได้ — มี Sensor ที่ใช้ประเภทนี้อยู่ ${count} ตัว`);
  }

  const { error } = await admin.from("sensor_type_catalog").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidateAll();
}
