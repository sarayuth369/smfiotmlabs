"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { publishToDevice, getDeviceRetained } from "@/lib/device-mqtt";
import { getUserPlan, hasFeature } from "@/lib/plan-limits";

export type LineConfig = {
  en: boolean;
  url: string;
  tok: string;
  uid: string;
  on: boolean; // notify when device comes online
  dr: boolean; // daily report enabled
  hm: number; // daily report time, minutes since midnight (0-1439)
  dow: number; // daily report days bitmask — bit0=Sun..bit6=Sat (matches LineConfigModel)
};

export type SheetsConfig = {
  en: boolean;
  url: string;
  tok: string;
  iv: number; // upload interval, minutes
};

function defaultLineConfig(): LineConfig {
  return { en: false, url: "https://api.line.me/v2/bot/message/push", tok: "", uid: "", on: true, dr: false, hm: 8 * 60, dow: 0x7f };
}
function defaultSheetsConfig(): SheetsConfig {
  return { en: false, url: "", tok: "", iv: 10 };
}

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

/** Prefer the firmware-confirmed *_status echo; fall back to the raw
 * config topic (device may be offline since the last edit). */
export async function getDeviceNotificationConfig(
  deviceId: string
): Promise<{ line: LineConfig; sheets: SheetsConfig }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { line: defaultLineConfig(), sheets: defaultSheetsConfig() };

  const { device_uid, customer_uuid } = await requireOwnedDevice(supabase, user.id, deviceId);

  const [lineStatus, lineRaw, sheetsStatus, sheetsRaw] = await Promise.all([
    getDeviceRetained<LineConfig>(customer_uuid, device_uid, "config_line_status"),
    getDeviceRetained<LineConfig>(customer_uuid, device_uid, "config_line"),
    getDeviceRetained<SheetsConfig>(customer_uuid, device_uid, "config_sheets_status"),
    getDeviceRetained<SheetsConfig>(customer_uuid, device_uid, "config_sheets"),
  ]);

  const line =
    (lineStatus.ok && lineStatus.found && lineStatus.payload) ||
    (lineRaw.ok && lineRaw.found && lineRaw.payload) ||
    defaultLineConfig();
  const sheets =
    (sheetsStatus.ok && sheetsStatus.found && sheetsStatus.payload) ||
    (sheetsRaw.ok && sheetsRaw.found && sheetsRaw.payload) ||
    defaultSheetsConfig();

  return { line, sheets };
}

export async function saveLineConfig(
  deviceId: string,
  config: LineConfig
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const plan = await getUserPlan(supabase, user.id);
  if (!hasFeature(plan, "line_notify")) {
    return { ok: false, error: `แพ็กเกจ ${plan.name} ไม่รองรับ LINE Notify` };
  }

  const { device_uid, customer_uuid, farm_id } = await requireOwnedDevice(supabase, user.id, deviceId);
  const result = await publishToDevice(customer_uuid, device_uid, "config_line", config, { retain: true });
  if (result.ok) revalidatePath(`/dashboard/farms/${farm_id}/notifications`);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function saveSheetsConfig(
  deviceId: string,
  config: SheetsConfig
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const plan = await getUserPlan(supabase, user.id);
  if (!hasFeature(plan, "sheets_export")) {
    return { ok: false, error: `แพ็กเกจ ${plan.name} ไม่รองรับ Google Sheet` };
  }

  const { device_uid, customer_uuid, farm_id } = await requireOwnedDevice(supabase, user.id, deviceId);
  const result = await publishToDevice(customer_uuid, device_uid, "config_sheets", config, { retain: true });
  if (result.ok) revalidatePath(`/dashboard/farms/${farm_id}/notifications`);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
