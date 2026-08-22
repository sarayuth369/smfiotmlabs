"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateDeviceCredentials,
  activateOnEmqxWebhook,
} from "@/lib/device-provision";

/**
 * Phase 6 — Regenerate MQTT credential for an existing device.
 *
 * Flow:
 *   1. Verify caller owns the device (RLS + explicit farm check).
 *   2. Resolve customer_identity_id from profile.
 *   3. Generate fresh 32-char password + bcrypt hash locally.
 *   4. Revoke any active credential row (unique-active constraint).
 *   5. Insert new device_credentials row (hash + prefix + last4 + topic prefix).
 *   6. Call EMQX webhook to CREATE-OR-UPDATE (idempotent) the broker user
 *      with the new password. ACL rules stay identical to first provision.
 *   7. Return plaintext password to caller ONCE — never persisted.
 *
 * After success:
 *   - Flutter app: update Broker password only.
 *   - ESP32: must Web-USB re-flash (password baked into firmware ProvisioningSlot).
 */
export async function regenerateDeviceCredential(
  deviceId: string
): Promise<
  | {
      ok: true;
      mqtt_username: string;
      mqtt_password: string;
      broker_registered: boolean;
      acl_rules?: number;
    }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const { data: device } = await supabase
    .from("iot_nodes")
    .select("id, device_uid, farm_id")
    .eq("id", deviceId)
    .maybeSingle();
  if (!device) return { ok: false, error: "device not found" };

  const { data: farmCheck } = await supabase
    .from("farms")
    .select("id")
    .eq("id", device.farm_id as string)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!farmCheck) return { ok: false, error: "not authorized for this device" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("customer_identity_id")
    .eq("id", user.id)
    .maybeSingle();
  const customerIdentityId = (profile?.customer_identity_id as string | null) ?? null;
  if (!customerIdentityId) {
    return {
      ok: false,
      error: "profile ยังไม่มี customer_identity_id — โปรดติดต่อผู้ดูแล",
    };
  }

  const deviceUid = device.device_uid as string;
  const creds = await generateDeviceCredentials(deviceUid, customerIdentityId);

  const admin = createAdminClient();

  // mqtt_username has a UNIQUE constraint (== device_uid, never changes).
  // Rotate the password IN PLACE on the existing row instead of insert-new.
  // Try UPDATE first; if no row matched, INSERT a fresh one (first-ever rotation).
  const nowIso = new Date().toISOString();
  const { data: updated, error: updErr } = await admin
    .from("device_credentials")
    .update({
      mqtt_password_hash: creds.mqtt_password_hash,
      mqtt_password_prefix: creds.mqtt_password_prefix,
      mqtt_password_last4: creds.mqtt_password.slice(-4),
      mqtt_topic_prefix: creds.mqtt_topic_prefix,
      provisioning_status: "active",
      revoked_at: null,
      rotated_at: nowIso,
    })
    .eq("device_id", deviceId)
    .select("id");

  if (updErr) {
    console.warn("[mqtt.regenerate] update error", updErr);
    return { ok: false, error: "failed to rotate credential: " + updErr.message };
  }

  if (!updated || updated.length === 0) {
    const { error: insErr } = await admin.from("device_credentials").insert({
      device_id: deviceId,
      mqtt_username: creds.mqtt_username,
      mqtt_password_hash: creds.mqtt_password_hash,
      mqtt_password_prefix: creds.mqtt_password_prefix,
      mqtt_password_last4: creds.mqtt_password.slice(-4),
      mqtt_topic_prefix: creds.mqtt_topic_prefix,
      provisioning_status: "active",
      created_by: user.id,
    });
    if (insErr) {
      console.warn("[mqtt.regenerate] insert error", insErr);
      return { ok: false, error: "failed to store new credential: " + insErr.message };
    }
  }

  // Rotate broker password via EMQX webhook (idempotent — PUT if exists, POST if new).
  const activation = await activateOnEmqxWebhook(creds, customerIdentityId);
  if (!activation.ok) {
    console.warn("[mqtt.regenerate] webhook activation failed", activation.error);
    return {
      ok: false,
      error:
        "credential เก็บใน DB แล้ว แต่ EMQX webhook ล้มเหลว: " +
        activation.error +
        " — ลอง refresh หน้าและ Regenerate อีกครั้ง",
    };
  }

  revalidatePath(`/dashboard/devices/${deviceId}/mqtt`);
  return {
    ok: true,
    mqtt_username: creds.mqtt_username,
    mqtt_password: creds.mqtt_password,
    broker_registered: true,
    acl_rules: activation.acl_rules,
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
