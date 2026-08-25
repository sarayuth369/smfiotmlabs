"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/admin/current";
import { logAdminAction } from "@/lib/admin/audit";
import { generateDeviceCredentials } from "@/lib/device-provision";
import {
  disableMqttUser,
  enableMqttUser,
  deleteMqttUser,
  isValidMqttUsername,
} from "@/lib/admin/mqtt-webhook";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Create (or rotate, if it already exists) an MQTT user directly on EMQX.
 * Reuses the exact same webhook op ("provision-device") as the normal
 * customer device-provisioning flow — no new EMQX integration path.
 * This does NOT touch Supabase iot_nodes/device_credentials; it's a
 * standalone infra-level credential, separate from customer device rows.
 */
export async function createMqttUser(formData: FormData): Promise<
  | { ok: true; username: string; password: string; acl_rules: number }
  | { ok: false; error: string }
> {
  const session = await requireModule("mqtt");

  const device_uid = String(formData.get("device_uid") ?? "").trim().toUpperCase();
  const customer_uuid = String(formData.get("customer_uuid") ?? "").trim();

  if (!isValidMqttUsername(device_uid)) {
    return { ok: false, error: "device_uid ต้องเป็นรูปแบบ SMF-XXXXXX (hex A-F 0-9, 6-20 ตัว)" };
  }
  if (!UUID_RE.test(customer_uuid)) {
    return { ok: false, error: "customer_uuid ต้องเป็น UUID ที่ถูกต้อง" };
  }

  const creds = await generateDeviceCredentials(device_uid, customer_uuid);

  const url = process.env.PROV_WEBHOOK_URL;
  const token = process.env.PROV_WEBHOOK_TOKEN;
  if (!url || !token) {
    await logAdminAction(session, "mqtt_user_create", device_uid, "failure", "webhook not configured");
    return { ok: false, error: "PROV_WEBHOOK_URL / PROV_WEBHOOK_TOKEN not configured" };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({
        op: "provision-device",
        device_uid,
        mqtt_password: creds.mqtt_password,
        customer_uuid,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      acl_rules?: number;
    };
    if (!res.ok || !body.ok) {
      await logAdminAction(session, "mqtt_user_create", device_uid, "failure", body.error);
      return { ok: false, error: body.error ?? "webhook http " + res.status };
    }
    await logAdminAction(session, "mqtt_user_create", device_uid, "success");
    revalidatePath("/admin/mqtt/users");
    revalidatePath("/admin/mqtt");
    return { ok: true, username: device_uid, password: creds.mqtt_password, acl_rules: body.acl_rules ?? 0 };
  } catch (e) {
    await logAdminAction(session, "mqtt_user_create", device_uid, "failure", (e as Error).message);
    return { ok: false, error: "webhook call failed: " + (e as Error).message };
  }
}

export async function disableUserAction(
  username: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireModule("mqtt");
  const result = await disableMqttUser(username);
  await logAdminAction(
    session,
    "mqtt_user_disable",
    username,
    result.ok ? "success" : "failure",
    result.ok ? undefined : result.error
  );
  revalidatePath("/admin/mqtt/users");
  revalidatePath("/admin/mqtt");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function enableUserAction(
  username: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireModule("mqtt");
  const result = await enableMqttUser(username);
  await logAdminAction(
    session,
    "mqtt_user_enable",
    username,
    result.ok ? "success" : "failure",
    result.ok ? undefined : result.error
  );
  revalidatePath("/admin/mqtt/users");
  revalidatePath("/admin/mqtt");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function deleteUserAction(
  username: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireModule("mqtt");
  const result = await deleteMqttUser(username);
  await logAdminAction(
    session,
    "mqtt_user_delete",
    username,
    result.ok ? "success" : "failure",
    result.ok ? undefined : result.error
  );
  revalidatePath("/admin/mqtt/users");
  revalidatePath("/admin/mqtt");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/**
 * Rotate password = create-or-update via the same provision-device op with
 * a freshly generated password and the SAME device_uid. Needs the
 * customer_uuid the user was originally created with, which this admin
 * surface does not track (see file header — no Supabase table backs
 * these standalone infra credentials). Caller must supply it again.
 */
export async function rotatePasswordAction(
  username: string,
  customer_uuid: string
): Promise<{ ok: true; password: string } | { ok: false; error: string }> {
  const session = await requireModule("mqtt");

  if (!isValidMqttUsername(username)) return { ok: false, error: "invalid username" };
  if (!UUID_RE.test(customer_uuid)) return { ok: false, error: "invalid customer_uuid" };

  const creds = await generateDeviceCredentials(username, customer_uuid);
  const url = process.env.PROV_WEBHOOK_URL;
  const token = process.env.PROV_WEBHOOK_TOKEN;
  if (!url || !token) return { ok: false, error: "webhook not configured" };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({
        op: "provision-device",
        device_uid: username,
        mqtt_password: creds.mqtt_password,
        customer_uuid,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !body.ok) {
      await logAdminAction(session, "mqtt_user_rotate_password", username, "failure", body.error);
      return { ok: false, error: body.error ?? "webhook http " + res.status };
    }
    await logAdminAction(session, "mqtt_user_rotate_password", username, "success");
    revalidatePath("/admin/mqtt/users");
    return { ok: true, password: creds.mqtt_password };
  } catch (e) {
    await logAdminAction(session, "mqtt_user_rotate_password", username, "failure", (e as Error).message);
    return { ok: false, error: "webhook call failed: " + (e as Error).message };
  }
}
