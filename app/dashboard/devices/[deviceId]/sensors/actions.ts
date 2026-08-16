"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canCreateSensor } from "@/lib/plan-limits";
import { isValidSensorType } from "@/lib/sensor-types";

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

function parseSensorFields(fd: FormData) {
  const name = String(fd.get("name") ?? "").trim();
  const sensor_type = String(fd.get("sensor_type") ?? "").trim();
  const unit = String(fd.get("unit") ?? "").trim() || null;
  const description = String(fd.get("description") ?? "").trim() || null;
  const channel = String(fd.get("channel") ?? "").trim() || null;
  const statusRaw = String(fd.get("status") ?? "active");
  const status: Status = isValidStatus(statusRaw) ? statusRaw : "active";

  if (!name) throw new Error("กรุณากรอกชื่อ Sensor");
  if (!isValidSensorType(sensor_type)) throw new Error("Sensor Type ไม่ถูกต้อง");

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

  const fields = parseSensorFields(formData);

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

  const fields = parseSensorFields(formData);
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
