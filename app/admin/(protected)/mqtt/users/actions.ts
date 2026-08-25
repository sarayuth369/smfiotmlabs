"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/admin/current";
import { logAdminAction } from "@/lib/admin/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateDeviceCredentials } from "@/lib/device-provision";
import { buildProvisionFirmwareBundle, type ProvisionFirmwareBundle } from "@/app/dashboard/devices/actions";
import {
  disableMqttUser,
  enableMqttUser,
  deleteMqttUser,
  getMqttUserDetail,
  isValidMqttUsername,
  type MqttUserDetail,
} from "@/lib/admin/mqtt-webhook";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Every admin-created MQTT credential is patched into this hardware
// model's base firmware — same constant the customer-facing provision
// flow uses (app/dashboard/devices/actions.ts). Single ESP32-S3 board
// design across the whole product; not worth a form field yet.
const HARDWARE_MODEL = "SMF-MAIN-V1";

type ProvisionOutcome =
  | { ok: true; username: string; password: string; acl_rules: number; firmware: ProvisionFirmwareBundle }
  | { ok: false; error: string };

/**
 * Shared by createMqttUser and rotatePasswordAction: calls the SAME
 * webhook op ("provision-device") the customer-facing flow uses, then
 * patches the base firmware with the fresh credentials so the result
 * can be handed straight to a Web USB flasher. No Supabase device row
 * is created or required — this is a standalone infra-level credential.
 */
async function provisionOrRotate(
  session: Awaited<ReturnType<typeof requireModule>>,
  action: "mqtt_user_create" | "mqtt_user_rotate_password",
  device_uid: string,
  customer_uuid: string
): Promise<ProvisionOutcome> {
  const creds = await generateDeviceCredentials(device_uid, customer_uuid);

  const url = process.env.PROV_WEBHOOK_URL;
  const token = process.env.PROV_WEBHOOK_TOKEN;
  if (!url || !token) {
    await logAdminAction(session, action, device_uid, "failure", "webhook not configured");
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
      await logAdminAction(session, action, device_uid, "failure", body.error);
      return { ok: false, error: body.error ?? "webhook http " + res.status };
    }

    const admin = createAdminClient();
    const firmware = await buildProvisionFirmwareBundle(admin, creds, customer_uuid, HARDWARE_MODEL);

    await logAdminAction(session, action, device_uid, "success");
    revalidatePath("/admin/mqtt/users");
    revalidatePath("/admin/mqtt");
    return {
      ok: true,
      username: device_uid,
      password: creds.mqtt_password,
      acl_rules: body.acl_rules ?? 0,
      firmware,
    };
  } catch (e) {
    await logAdminAction(session, action, device_uid, "failure", (e as Error).message);
    return { ok: false, error: "webhook call failed: " + (e as Error).message };
  }
}

export async function createMqttUser(formData: FormData): Promise<ProvisionOutcome> {
  const session = await requireModule("mqtt");

  const device_uid = String(formData.get("device_uid") ?? "").trim().toUpperCase();
  const customer_uuid = String(formData.get("customer_uuid") ?? "").trim();

  if (!isValidMqttUsername(device_uid)) {
    return { ok: false, error: "device_uid ต้องเป็นรูปแบบ SMF-XXXXXX (hex A-F 0-9, 6-20 ตัว)" };
  }
  if (!UUID_RE.test(customer_uuid)) {
    return { ok: false, error: "customer_uuid ต้องเป็น UUID ที่ถูกต้อง" };
  }

  return provisionOrRotate(session, "mqtt_user_create", device_uid, customer_uuid);
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
 * a freshly generated password and the SAME device_uid, then re-patch
 * firmware with it. Needs the customer_uuid the user was originally
 * created with, which this admin surface does not track (see file header
 * — no Supabase table backs these standalone infra credentials). Caller
 * must supply it again.
 */
export async function rotatePasswordAction(
  username: string,
  customer_uuid: string
): Promise<ProvisionOutcome> {
  const session = await requireModule("mqtt");

  if (!isValidMqttUsername(username)) return { ok: false, error: "invalid username" };
  if (!UUID_RE.test(customer_uuid)) return { ok: false, error: "invalid customer_uuid" };

  return provisionOrRotate(session, "mqtt_user_rotate_password", username, customer_uuid);
}

export async function getUserDetailAction(
  username: string
): Promise<{ ok: true; detail: MqttUserDetail } | { ok: false; error: string }> {
  await requireModule("mqtt");
  const res = await getMqttUserDetail(username);
  if (!res.ok) return { ok: false, error: res.error };
  const { ok: _ok, ...detail } = res;
  void _ok;
  return { ok: true, detail: detail as MqttUserDetail };
}

/** Polled by the admin flasher's "waiting for online" step. A user counts
 * as online here if EMQX currently shows an active session for it —
 * there's no Supabase iot_nodes row backing these credentials to check
 * last_seen against. */
export async function checkUserOnlineAction(
  username: string
): Promise<{ online: boolean; session_count: number }> {
  await requireModule("mqtt");
  const res = await getMqttUserDetail(username);
  if (!res.ok) return { online: false, session_count: 0 };
  return { online: res.sessions.length > 0, session_count: res.sessions.length };
}
