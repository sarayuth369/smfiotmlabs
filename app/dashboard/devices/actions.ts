"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canCreateNode } from "@/lib/plan-limits";

const DEVICE_UID_RE = /^[A-Z0-9][A-Z0-9\-_]{2,63}$/i;

async function requireOwnedFarm(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  farmId: string
): Promise<void> {
  const { data } = await supabase
    .from("farms")
    .select("id")
    .eq("id", farmId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("ไม่พบฟาร์ม หรือคุณไม่มีสิทธิ์เข้าถึง");
}

/** Ensures zone (if provided) belongs to the given farm. */
async function validateZoneInFarm(
  supabase: Awaited<ReturnType<typeof createClient>>,
  zoneId: string | null,
  farmId: string
): Promise<void> {
  if (!zoneId) return;
  const { data } = await supabase
    .from("zones")
    .select("id")
    .eq("id", zoneId)
    .eq("farm_id", farmId)
    .maybeSingle();
  if (!data) throw new Error("แปลง (Zone) ที่เลือกไม่อยู่ในฟาร์มนี้");
}

function parseCommonFields(fd: FormData) {
  const device_name = String(fd.get("device_name") ?? "").trim();
  const device_type = String(fd.get("device_type") ?? "").trim() || null;
  const model = String(fd.get("model") ?? "").trim() || null;
  const firmware_version = String(fd.get("firmware_version") ?? "").trim() || null;
  const zoneRaw = String(fd.get("zone_id") ?? "").trim();
  const zone_id = zoneRaw === "" ? null : zoneRaw;
  if (!device_name) throw new Error("กรุณากรอกชื่ออุปกรณ์");
  return { device_name, device_type, model, firmware_version, zone_id };
}

export async function createDevice(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/devices/new");

  const device_uid = String(formData.get("device_uid") ?? "").trim().toUpperCase();
  const farm_id = String(formData.get("farm_id") ?? "").trim();

  if (!device_uid) throw new Error("กรุณากรอก Device UID");
  if (!DEVICE_UID_RE.test(device_uid)) {
    throw new Error("Device UID ต้องเป็นตัวอักษร/ตัวเลข/ขีดกลาง 3–64 ตัว");
  }
  if (!farm_id) throw new Error("กรุณาเลือกฟาร์ม");

  await requireOwnedFarm(supabase, user.id, farm_id);

  const check = await canCreateNode(supabase, user.id);
  if (!check.ok) throw new Error(check.reason ?? "เกินโควตาแพ็กเกจ");

  const common = parseCommonFields(formData);
  await validateZoneInFarm(supabase, common.zone_id, farm_id);

  const { data, error } = await supabase
    .from("iot_nodes")
    .insert({ ...common, device_uid, farm_id })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("Device UID นี้ถูกใช้งานแล้ว");
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/devices");
  revalidatePath(`/dashboard/farms/${farm_id}`);
  revalidatePath(`/dashboard/farms/${farm_id}/devices`);
  redirect(`/dashboard/devices/${data.id}`);
}

export async function updateDevice(deviceId: string, formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Load current row to know old farm_id (for revalidation + ownership check)
  const { data: current } = await supabase
    .from("iot_nodes")
    .select("id, farm_id")
    .eq("id", deviceId)
    .maybeSingle();
  if (!current) throw new Error("ไม่พบอุปกรณ์");

  await requireOwnedFarm(supabase, user.id, current.farm_id);

  const farm_id = String(formData.get("farm_id") ?? current.farm_id).trim() || current.farm_id;
  await requireOwnedFarm(supabase, user.id, farm_id); // destination farm must also be user's

  const common = parseCommonFields(formData);
  await validateZoneInFarm(supabase, common.zone_id, farm_id);

  const { error } = await supabase
    .from("iot_nodes")
    .update({ ...common, farm_id })
    .eq("id", deviceId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/devices");
  revalidatePath(`/dashboard/devices/${deviceId}`);
  revalidatePath(`/dashboard/farms/${current.farm_id}`);
  revalidatePath(`/dashboard/farms/${current.farm_id}/devices`);
  if (farm_id !== current.farm_id) {
    revalidatePath(`/dashboard/farms/${farm_id}`);
    revalidatePath(`/dashboard/farms/${farm_id}/devices`);
  }
  redirect(`/dashboard/devices/${deviceId}`);
}

export async function archiveDevice(deviceId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: current } = await supabase
    .from("iot_nodes")
    .select("farm_id")
    .eq("id", deviceId)
    .maybeSingle();
  if (!current) throw new Error("ไม่พบอุปกรณ์");
  await requireOwnedFarm(supabase, user.id, current.farm_id);

  const { error } = await supabase
    .from("iot_nodes")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", deviceId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/devices");
  revalidatePath(`/dashboard/farms/${current.farm_id}/devices`);
  redirect("/dashboard/devices");
}

export async function restoreDevice(deviceId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: current } = await supabase
    .from("iot_nodes")
    .select("farm_id")
    .eq("id", deviceId)
    .maybeSingle();
  if (!current) throw new Error("ไม่พบอุปกรณ์");
  await requireOwnedFarm(supabase, user.id, current.farm_id);

  const check = await canCreateNode(supabase, user.id);
  if (!check.ok) throw new Error(check.reason ?? "เกินโควตาแพ็กเกจ ไม่สามารถกู้คืนได้");

  const { error } = await supabase
    .from("iot_nodes")
    .update({ archived_at: null })
    .eq("id", deviceId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/devices");
  revalidatePath(`/dashboard/devices/${deviceId}`);
  revalidatePath(`/dashboard/farms/${current.farm_id}/devices`);
  redirect(`/dashboard/devices/${deviceId}`);
}

export async function deleteDevice(deviceId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: current } = await supabase
    .from("iot_nodes")
    .select("farm_id")
    .eq("id", deviceId)
    .maybeSingle();
  if (!current) throw new Error("ไม่พบอุปกรณ์");
  await requireOwnedFarm(supabase, user.id, current.farm_id);

  const { error } = await supabase.from("iot_nodes").delete().eq("id", deviceId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/devices");
  revalidatePath(`/dashboard/farms/${current.farm_id}/devices`);
  redirect("/dashboard/devices");
}
