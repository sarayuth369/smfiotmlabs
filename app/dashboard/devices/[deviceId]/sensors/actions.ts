"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canCreateSensor, getUserPlan } from "@/lib/plan-limits";
import {
  getSensorTypeCatalog,
  isValidSensorTypeFrom,
  visibleSensorTypesForPlan,
  type SensorTypeInfo,
} from "@/lib/sensor-types";

const HISTORY_INTERVALS = [10, 30, 60] as const;

const STATUSES = ["active", "inactive"] as const;
type Status = (typeof STATUSES)[number];
function isValidStatus(x: string): x is Status {
  return (STATUSES as readonly string[]).includes(x);
}

/** Verify user owns the device (via parent farm). Returns nothing on success, throws on failure. */
async function requireOwnedDevice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  deviceId: string
): Promise<void> {
  const { data } = await supabase
    .from("iot_nodes")
    .select("id, farm_id, farms!inner(user_id)")
    .eq("id", deviceId)
    .maybeSingle();
  const farmRel = (data as unknown as { farms: { user_id: string } | { user_id: string }[] } | null)?.farms;
  const ownerId = Array.isArray(farmRel) ? farmRel[0]?.user_id : farmRel?.user_id;
  if (!data || ownerId !== userId) {
    throw new Error("ไม่พบอุปกรณ์ หรือคุณไม่มีสิทธิ์เข้าถึง");
  }
}

function parseSensorFields(fd: FormData, catalog: SensorTypeInfo[]) {
  const name = String(fd.get("name") ?? "").trim();
  const sensor_type = String(fd.get("sensor_type") ?? "").trim();
  const unit = String(fd.get("unit") ?? "").trim() || null;
  const description = String(fd.get("description") ?? "").trim() || null;
  const channel = String(fd.get("channel") ?? "").trim() || null;
  const statusRaw = String(fd.get("status") ?? "active");
  const status: Status = isValidStatus(statusRaw) ? statusRaw : "active";

  if (!name) throw new Error("กรุณากรอกชื่อ Sensor");
  if (!isValidSensorTypeFrom(catalog, sensor_type)) throw new Error("Sensor Type ไม่ถูกต้อง");

  return { name, sensor_type, unit, description, channel, status };
}

export async function createSensor(deviceId: string, formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/dashboard/devices/${deviceId}/sensors/new`);

  await requireOwnedDevice(supabase, user.id, deviceId);

  const check = await canCreateSensor(supabase, user.id);
  if (!check.ok) throw new Error(check.reason ?? "เกินโควตาแพ็กเกจ");

  const [catalog, plan] = await Promise.all([getSensorTypeCatalog(supabase), getUserPlan(supabase, user.id)]);
  const fields = parseSensorFields(formData, catalog);

  // Defense in depth — the "เพิ่ม Sensor" dialog only ever shows the
  // plan-visible slice of the catalog, but a Server Action's form fields
  // are still client-suppliable, so re-check the type wasn't chosen from
  // beyond what this plan is allowed to pick.
  const visible = visibleSensorTypesForPlan(catalog, plan.limits.max_sensors);
  if (!visible.some((t) => t.key === fields.sensor_type)) {
    throw new Error(`แพ็กเกจ ${plan.name} ยังไม่รองรับ Sensor ประเภทนี้ — อัปเกรดแพ็กเกจเพื่อเปิดใช้งาน`);
  }

  const { data, error } = await supabase
    .from("sensors")
    .insert({ ...fields, device_id: deviceId })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new Error("มี Sensor ประเภทนี้ (channel เดียวกัน) อยู่แล้วในอุปกรณ์นี้");
    }
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/devices/${deviceId}`);
  redirect(`/dashboard/devices/${deviceId}/sensors/${data.id}`);
}

export async function updateSensor(
  deviceId: string,
  sensorId: string,
  formData: FormData
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await requireOwnedDevice(supabase, user.id, deviceId);

  const catalog = await getSensorTypeCatalog(supabase);
  const fields = parseSensorFields(formData, catalog);
  const { error } = await supabase
    .from("sensors")
    .update(fields)
    .eq("id", sensorId)
    .eq("device_id", deviceId);
  if (error) {
    if (error.code === "23505") {
      throw new Error("มี Sensor ประเภทนี้ (channel เดียวกัน) อยู่แล้วในอุปกรณ์นี้");
    }
    throw new Error(error.message);
  }

  revalidatePath(`/dashboard/devices/${deviceId}`);
  revalidatePath(`/dashboard/devices/${deviceId}/sensors/${sensorId}`);
  redirect(`/dashboard/devices/${deviceId}/sensors/${sensorId}`);
}

export async function archiveSensor(deviceId: string, sensorId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await requireOwnedDevice(supabase, user.id, deviceId);

  const { error } = await supabase
    .from("sensors")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", sensorId)
    .eq("device_id", deviceId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/devices/${deviceId}`);
  redirect(`/dashboard/devices/${deviceId}`);
}

export async function restoreSensor(deviceId: string, sensorId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await requireOwnedDevice(supabase, user.id, deviceId);

  const check = await canCreateSensor(supabase, user.id);
  if (!check.ok) throw new Error(check.reason ?? "เกินโควตาแพ็กเกจ ไม่สามารถกู้คืนได้");

  const { error } = await supabase
    .from("sensors")
    .update({ archived_at: null })
    .eq("id", sensorId)
    .eq("device_id", deviceId);
  if (error) {
    if (error.code === "23505") {
      throw new Error("มี Sensor ประเภทเดียวกัน active อยู่แล้ว — เปลี่ยน type/channel ก่อนกู้คืน");
    }
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/devices/${deviceId}`);
  revalidatePath(`/dashboard/devices/${deviceId}/sensors/${sensorId}`);
  redirect(`/dashboard/devices/${deviceId}/sensors/${sensorId}`);
}

export async function deleteSensor(deviceId: string, sensorId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await requireOwnedDevice(supabase, user.id, deviceId);

  const { error } = await supabase
    .from("sensors")
    .delete()
    .eq("id", sensorId)
    .eq("device_id", deviceId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/devices/${deviceId}`);
  redirect(`/dashboard/devices/${deviceId}`);
}

/**
 * Phase 6.9b — toggle opt-in sensor history recording + interval.
 * Server-side re-checks the plan's "sensor_history" entitlement even
 * though the UI already hides/disables the control for plans without
 * it — the ingest route enforces this too (defense in depth), but a
 * user should never even be able to persist record_history=true if
 * their plan doesn't allow it.
 */
export async function updateSensorHistoryAction(
  deviceId: string,
  sensorId: string,
  recordHistory: boolean,
  intervalMinutes: number
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  await requireOwnedDevice(supabase, user.id, deviceId);

  if (!(HISTORY_INTERVALS as readonly number[]).includes(intervalMinutes)) {
    return { ok: false, error: "interval ไม่ถูกต้อง" };
  }

  const { error } = await supabase
    .from("sensors")
    .update({ record_history: recordHistory, history_interval_minutes: intervalMinutes })
    .eq("id", sensorId)
    .eq("device_id", deviceId);
  if (error) throw new Error(error.message);

  revalidatePath(`/dashboard/devices/${deviceId}/sensors/${sensorId}`);
  return { ok: true };
}
