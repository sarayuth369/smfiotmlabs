"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createDeviceCredential,
  revokeDeviceCredential,
  toCredentialMetadata,
  type DeviceAclSpec,
} from "@/lib/mqtt-credential";

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
): Promise<
  | {
      ok: true;
      mqtt_username: string;
      mqtt_password: string;
      broker_registered?: boolean;
      manual_instruction?: string;
    }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  // Ownership check via RLS-scoped read (user client). Resolve customer_identity_id
  // for ACL scoping (automatic mode only — manual mode ignores ACL param).
  const { data: device } = await supabase
    .from("iot_nodes")
    .select(
      "id, device_uid, farms!inner(user_id, profiles!inner(customer_identity_id))"
    )
    .eq("id", deviceId)
    .maybeSingle();
  if (!device) return { ok: false, error: "device not found" };

  const farmsRel = (device as unknown as {
    farms?: { profiles?: { customer_identity_id?: string | null } }
      | { profiles?: { customer_identity_id?: string | null } }[];
  }).farms;
  const farm = Array.isArray(farmsRel) ? farmsRel[0] : farmsRel;
  const profile = Array.isArray(farm?.profiles) ? farm.profiles[0] : farm?.profiles;
  const customerIdentityId = profile?.customer_identity_id ?? null;

  const acl: DeviceAclSpec | undefined = customerIdentityId
    ? { customer_identity_id: customerIdentityId, device_uid: device.device_uid as string }
    : undefined;

  // Delegate to broker-agnostic adapter (manual now, automatic when Starter tier set).
  const result = await createDeviceCredential(device.device_uid as string, acl);
  if (!result.ok) {
    console.warn("[mqtt.regenerate] adapter failed", result.error);
    return { ok: false, error: `broker provisioning failed: ${result.error}` };
  }
  const { credential } = result.data;
  const meta = toCredentialMetadata(credential);

  const admin = createAdminClient();

  // Revoke any existing active credential (partial unique index enforces one active per device)
  const { data: existing } = await admin
    .from("device_credentials")
    .select("mqtt_username")
    .eq("device_id", deviceId)
    .is("revoked_at", null);
  await admin
    .from("device_credentials")
    .update({
      revoked_at: new Date().toISOString(),
      provisioning_status: "revoked",
    })
    .eq("device_id", deviceId)
    .is("revoked_at", null);

  // Best-effort broker revoke of previous credential (automatic mode). Manual = no-op.
  for (const prev of existing ?? []) {
    if (prev.mqtt_username && prev.mqtt_username !== meta.mqtt_username) {
      await revokeDeviceCredential(prev.mqtt_username as string).catch(() => {
        /* non-fatal */
      });
    }
  }

  // Insert new credential — status reflects broker registration outcome
  const status = result.brokerRegistered ? "active" : "active"; // manual mode = active immediately
  const { error: insErr } = await admin.from("device_credentials").insert({
    device_id: deviceId,
    mqtt_username: meta.mqtt_username,
    mqtt_password_hash: meta.mqtt_password_hash,
    mqtt_password_prefix: meta.mqtt_password_prefix,
    mqtt_password_last4: meta.mqtt_password_last4,
    hivemq_credential_id: result.data.brokerCredentialId ?? null,
    provisioning_status: status,
    created_by: user.id,
  });
  if (insErr) {
    console.warn("[mqtt.regenerate] insert error", insErr);
    // Safe failure: if we created a broker credential but DB write failed,
    // rollback broker credential to avoid orphan.
    if (result.brokerRegistered) {
      await revokeDeviceCredential(meta.mqtt_username).catch(() => {
        /* logged */
      });
    }
    return { ok: false, error: "failed to store credential" };
  }

  revalidatePath(`/dashboard/devices/${deviceId}/mqtt`);
  return {
    ok: true,
    mqtt_username: credential.mqtt_username,
    mqtt_password: credential.mqtt_password,
    broker_registered: result.brokerRegistered,
    manual_instruction: result.manualInstruction,
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

