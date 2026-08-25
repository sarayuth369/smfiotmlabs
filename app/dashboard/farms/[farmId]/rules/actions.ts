"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { publishToDevice, getDeviceRetained } from "@/lib/device-mqtt";
import { getUserPlan, hasFeature } from "@/lib/plan-limits";

export type ScheduleEntry = { ch: number; en: boolean; on: number; off: number; days: number };
export type RuleEntry = {
  id: string;
  en: boolean;
  src: string;
  cmp: "gt" | "lt";
  val: number;
  ch: number;
  act: boolean;
  nl: boolean;
};

type DeviceOwnership = { device_uid: string; farm_id: string; customer_uuid: string };

async function requireOwnedDevice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  deviceId: string
): Promise<DeviceOwnership> {
  const { data } = await supabase
    .from("iot_nodes")
    .select("device_uid, farm_id, farms!inner(user_id)")
    .eq("id", deviceId)
    .maybeSingle();
  const farmRel = (data as unknown as { farms: { user_id: string } | { user_id: string }[] } | null)?.farms;
  const ownerId = Array.isArray(farmRel) ? farmRel[0]?.user_id : farmRel?.user_id;
  if (!data || ownerId !== userId) {
    throw new Error("ไม่พบอุปกรณ์ หรือคุณไม่มีสิทธิ์เข้าถึง");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("customer_identity_id")
    .eq("id", userId)
    .maybeSingle();
  const customer_uuid = profile?.customer_identity_id as string | null;
  if (!customer_uuid) throw new Error("profile ยังไม่มี customer_identity_id — โปรดติดต่อผู้ดูแล");

  return { device_uid: data.device_uid as string, farm_id: data.farm_id as string, customer_uuid };
}

/** Prefer the firmware-confirmed *_status echo (what's actually applied);
 * fall back to the raw config topic (what was last SENT, in case the
 * device hasn't echoed back yet — e.g. offline since the last edit). */
export async function getDeviceScheduleAndRules(
  deviceId: string
): Promise<{ schedules: ScheduleEntry[]; rules: RuleEntry[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { schedules: [], rules: [] };

  const { device_uid, customer_uuid } = await requireOwnedDevice(supabase, user.id, deviceId);

  const [statusSched, rawSched, statusRules, rawRules] = await Promise.all([
    getDeviceRetained<ScheduleEntry[]>(customer_uuid, device_uid, "config_schedule_status"),
    getDeviceRetained<ScheduleEntry[]>(customer_uuid, device_uid, "config_schedule"),
    getDeviceRetained<RuleEntry[]>(customer_uuid, device_uid, "config_rules_status"),
    getDeviceRetained<RuleEntry[]>(customer_uuid, device_uid, "config_rules"),
  ]);

  const schedules =
    (statusSched.ok && statusSched.found && statusSched.payload) ||
    (rawSched.ok && rawSched.found && rawSched.payload) ||
    [];
  const rules =
    (statusRules.ok && statusRules.found && statusRules.payload) ||
    (rawRules.ok && rawRules.found && rawRules.payload) ||
    [];

  return { schedules, rules };
}

export async function saveSchedule(
  deviceId: string,
  schedules: ScheduleEntry[]
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const plan = await getUserPlan(supabase, user.id);
  if (!hasFeature(plan, "rules")) {
    return { ok: false, error: `แพ็กเกจ ${plan.name} ไม่รองรับ Rules` };
  }

  const { device_uid, customer_uuid, farm_id } = await requireOwnedDevice(supabase, user.id, deviceId);

  const result = await publishToDevice(customer_uuid, device_uid, "config_schedule", schedules, {
    retain: true,
  });
  if (result.ok) revalidatePath(`/dashboard/farms/${farm_id}/rules`);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function saveRules(
  deviceId: string,
  rules: RuleEntry[]
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const plan = await getUserPlan(supabase, user.id);
  if (!hasFeature(plan, "rules")) {
    return { ok: false, error: `แพ็กเกจ ${plan.name} ไม่รองรับ Rules` };
  }

  const { device_uid, customer_uuid, farm_id } = await requireOwnedDevice(supabase, user.id, deviceId);

  const result = await publishToDevice(customer_uuid, device_uid, "config_rules", rules, { retain: true });
  if (result.ok) revalidatePath(`/dashboard/farms/${farm_id}/rules`);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
