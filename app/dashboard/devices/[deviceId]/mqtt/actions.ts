"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateDeviceCredential } from "@/lib/device-auth";

/**
 * Regenerate MQTT credential for a device.
 * Returns plaintext password ONCE — never stored. bcrypt hash goes to
 * device_credentials. Previous active credential is revoked.
 *
 * ⚠ Free HiveMQ tier: broker credential must ALSO be updated manually in
 * HiveMQ Dashboard. This action only updates SMF-side hash record.
 * Starter tier + REST API: server can auto-create broker credential (TODO).
 */
export async function regenerateDeviceCredential(
  deviceId: string
): Promise<{ ok: true; mqtt_username: string; mqtt_password: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  // Ownership check via RLS-scoped read (user client)
  const { data: device } = await supabase
    .from("iot_nodes")
    .select("id, device_uid")
    .eq("id", deviceId)
    .maybeSingle();
  if (!device) return { ok: false, error: "device not found" };

  const admin = createAdminClient();
  const cred = await generateDeviceCredential(device.device_uid as string);

  // Revoke any existing active credential (partial unique index enforces one active per device)
  await admin
    .from("device_credentials")
    .update({ revoked_at: new Date().toISOString() })
    .eq("device_id", deviceId)
    .is("revoked_at", null);

  // Insert new active credential
  const { error: insErr } = await admin.from("device_credentials").insert({
    device_id: deviceId,
    mqtt_username: cred.mqtt_username,
    mqtt_password_hash: cred.mqtt_password_hash,
    mqtt_password_prefix: cred.mqtt_password_prefix,
    mqtt_password_last4: cred.mqtt_password.slice(-4),
    created_by: user.id,
  });
  if (insErr) {
    console.warn("[mqtt.regenerate] insert error", insErr);
    return { ok: false, error: "failed to store credential" };
  }

  revalidatePath(`/dashboard/devices/${deviceId}/mqtt`);
  return {
    ok: true,
    mqtt_username: cred.mqtt_username,
    mqtt_password: cred.mqtt_password,
  };
}

/**
 * Claim a device by its factory-generated code. Transfers device ownership
 * to caller's farm/zone. Atomic via RPC + row lock.
 */
export async function claimDeviceByCode(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const code = String(formData.get("code") ?? "").trim();
  const farmId = String(formData.get("farm_id") ?? "").trim();
  const zoneId = String(formData.get("zone_id") ?? "").trim() || null;

  if (!code || !farmId) return;

  const { data, error } = await supabase.rpc("claim_device_by_code", {
    p_code: code,
    p_farm_id: farmId,
    p_zone_id: zoneId,
  });
  if (error) {
    console.warn("[claim] error", error.message);
    return;
  }
  const deviceId = (data as { device_id: string }[] | null)?.[0]?.device_id;
  if (deviceId) revalidatePath(`/dashboard/devices/${deviceId}`);
  revalidatePath("/dashboard/farms");
}

