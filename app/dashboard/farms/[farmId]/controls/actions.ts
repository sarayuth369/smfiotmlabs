"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canCreateRelay } from "@/lib/plan-limits";
import { publishToDevice, getDeviceRetained } from "@/lib/device-mqtt";

type DeviceOwnership = { device_uid: string; farm_id: string; customer_uuid: string };

/** Verify user owns the device (via parent farm) and resolve the values
 * needed to talk to the broker (device_uid + the account's customer_uuid). */
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

export async function createRelay(deviceId: string, formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { farm_id } = await requireOwnedDevice(supabase, user.id, deviceId);

  const check = await canCreateRelay(supabase, user.id);
  if (!check.ok) throw new Error(check.reason ?? "เกินโควตาแพ็กเกจ");

  const channel = Number(formData.get("channel"));
  const name = String(formData.get("name") ?? "").trim() || `ตัวควบคุม ${channel}`;
  if (!Number.isInteger(channel) || channel < 1 || channel > 4) {
    throw new Error("Channel ต้องเป็น 1-4 (ตามฮาร์ดแวร์ ESP32-S3 4-channel relay)");
  }

  const { error } = await supabase.from("relays").insert({ device_id: deviceId, channel, name });
  if (error) {
    if (error.code === "23505") throw new Error("Channel นี้ถูกใช้ในอุปกรณ์นี้แล้ว");
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/farms/${farm_id}/controls`);
}

export async function deleteRelay(deviceId: string, relayId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { farm_id } = await requireOwnedDevice(supabase, user.id, deviceId);

  const { error } = await supabase.from("relays").delete().eq("id", relayId).eq("device_id", deviceId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/farms/${farm_id}/controls`);
}

/** One-shot relay toggle — publishes {state} to cmd/relay/{ch}, NOT
 * retained (matches the Flutter app's RelayProvider.toggleRelay exactly,
 * so App and Web control the same device consistently). */
export async function toggleRelay(
  deviceId: string,
  channel: number,
  desired: boolean
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const { device_uid, customer_uuid } = await requireOwnedDevice(supabase, user.id, deviceId);

  const result = await publishToDevice(
    customer_uuid,
    device_uid,
    "relay_cmd",
    { state: desired },
    { channel, retain: false }
  );
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/** Read the device's last-reported actual relay state (event/relay/{ch},
 * retained by firmware after it acts on a command). Best-effort — null
 * if the device has never reported this channel (e.g. brand new). */
export async function getRelayState(
  deviceId: string,
  channel: number
): Promise<boolean | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { device_uid, customer_uuid } = await requireOwnedDevice(supabase, user.id, deviceId);
  const result = await getDeviceRetained<{ state?: boolean }>(
    customer_uuid,
    device_uid,
    "relay_event",
    channel
  );
  if (!result.ok || !result.found || !result.payload) return null;
  return result.payload.state ?? null;
}
