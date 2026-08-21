"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canCreateNode } from "@/lib/plan-limits";
import {
  generateUniqueDeviceUid,
  generateDeviceCredentials,
  buildSecretsHFile,
  buildEmqxActivationCommand,
  activateOnEmqxWebhook,
  type ProvisionedCredentials,
} from "@/lib/device-provision";

const DEVICE_UID_RE = /^[A-Z0-9][A-Z0-9\-_]{2,63}$/i;

async function requireOwnedFarm(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  farmId: string
): Promise<void> {
  const { data } = await supabase
    .from("farms")
    .select("id")
    .eq("id", farmId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("ไม่พบฟาร์ม หรือคุณไม่มีสิทธิ์เข้าถึง");
}

/** Ensures zone (if provided) belongs to the given farm. */
async function validateZoneInFarm(
  supabase: Awaited<ReturnType<typeof createClient>>,
  zoneId: string | null,
  farmId: string
): Promise<void> {
  if (!zoneId) return;
  const { data } = await supabase
    .from("zones")
    .select("id")
    .eq("id", zoneId)
    .eq("farm_id", farmId)
    .maybeSingle();
  if (!data) throw new Error("แปลง (Zone) ที่เลือกไม่อยู่ในฟาร์มนี้");
}

function parseCommonFields(fd: FormData) {
  const device_name = String(fd.get("device_name") ?? "").trim();
  const device_type = String(fd.get("device_type") ?? "").trim() || null;
  const model = String(fd.get("model") ?? "").trim() || null;
  const firmware_version = String(fd.get("firmware_version") ?? "").trim() || null;
  const zoneRaw = String(fd.get("zone_id") ?? "").trim();
  const zone_id = zoneRaw === "" ? null : zoneRaw;
  if (!device_name) throw new Error("กรุณากรอกชื่ออุปกรณ์");
  return { device_name, device_type, model, firmware_version, zone_id };
}

export async function createDevice(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/devices/new");

  const device_uid = String(formData.get("device_uid") ?? "").trim().toUpperCase();
  const farm_id = String(formData.get("farm_id") ?? "").trim();

  if (!device_uid) throw new Error("กรุณากรอก Device UID");
  if (!DEVICE_UID_RE.test(device_uid)) {
    throw new Error("Device UID ต้องเป็นตัวอักษร/ตัวเลข/ขีดกลาง 3–64 ตัว");
  }
  if (!farm_id) throw new Error("กรุณาเลือกฟาร์ม");

  await requireOwnedFarm(supabase, user.id, farm_id);

  const check = await canCreateNode(supabase, user.id);
  if (!check.ok) throw new Error(check.reason ?? "เกินโควตาแพ็กเกจ");

  const common = parseCommonFields(formData);
  await validateZoneInFarm(supabase, common.zone_id, farm_id);

  const { data, error } = await supabase
    .from("iot_nodes")
    .insert({ ...common, device_uid, farm_id })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("Device UID นี้ถูกใช้งานแล้ว");
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/devices");
  revalidatePath(`/dashboard/farms/${farm_id}`);
  revalidatePath(`/dashboard/farms/${farm_id}/devices`);
  redirect(`/dashboard/devices/${data.id}`);
}

export async function updateDevice(deviceId: string, formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Load current row to know old farm_id (for revalidation + ownership check)
  const { data: current } = await supabase
    .from("iot_nodes")
    .select("id, farm_id")
    .eq("id", deviceId)
    .maybeSingle();
  if (!current) throw new Error("ไม่พบอุปกรณ์");

  await requireOwnedFarm(supabase, user.id, current.farm_id);

  const farm_id = String(formData.get("farm_id") ?? current.farm_id).trim() || current.farm_id;
  await requireOwnedFarm(supabase, user.id, farm_id); // destination farm must also be user's

  const common = parseCommonFields(formData);
  await validateZoneInFarm(supabase, common.zone_id, farm_id);

  const { error } = await supabase
    .from("iot_nodes")
    .update({ ...common, farm_id })
    .eq("id", deviceId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/devices");
  revalidatePath(`/dashboard/devices/${deviceId}`);
  revalidatePath(`/dashboard/farms/${current.farm_id}`);
  revalidatePath(`/dashboard/farms/${current.farm_id}/devices`);
  if (farm_id !== current.farm_id) {
    revalidatePath(`/dashboard/farms/${farm_id}`);
    revalidatePath(`/dashboard/farms/${farm_id}/devices`);
  }
  redirect(`/dashboard/devices/${deviceId}`);
}

export async function archiveDevice(deviceId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: current } = await supabase
    .from("iot_nodes")
    .select("farm_id")
    .eq("id", deviceId)
    .maybeSingle();
  if (!current) throw new Error("ไม่พบอุปกรณ์");
  await requireOwnedFarm(supabase, user.id, current.farm_id);

  const { error } = await supabase
    .from("iot_nodes")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", deviceId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/devices");
  revalidatePath(`/dashboard/farms/${current.farm_id}/devices`);
  redirect("/dashboard/devices");
}

export async function restoreDevice(deviceId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: current } = await supabase
    .from("iot_nodes")
    .select("farm_id")
    .eq("id", deviceId)
    .maybeSingle();
  if (!current) throw new Error("ไม่พบอุปกรณ์");
  await requireOwnedFarm(supabase, user.id, current.farm_id);

  const check = await canCreateNode(supabase, user.id);
  if (!check.ok) throw new Error(check.reason ?? "เกินโควตาแพ็กเกจ ไม่สามารถกู้คืนได้");

  const { error } = await supabase
    .from("iot_nodes")
    .update({ archived_at: null })
    .eq("id", deviceId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/devices");
  revalidatePath(`/dashboard/devices/${deviceId}`);
  revalidatePath(`/dashboard/farms/${current.farm_id}/devices`);
  redirect(`/dashboard/devices/${deviceId}`);
}

/**
 * Phase 6.2 PROVISIONING — register a device with server-generated
 * unique device_uid + MQTT credentials + narrow ACL topic prefix.
 *
 * Returns the plaintext MQTT password ONCE for immediate download.
 * After this call, only the bcrypt hash is retained.
 *
 * Steps:
 *  1. Validate ownership, farm, zone, plan limits.
 *  2. Resolve customer_identity_id (from profile).
 *  3. Generate unique SMF-XXXXXX device_uid (server, collision-checked).
 *  4. Generate 32-char random MQTT password + bcrypt hash.
 *  5. Insert iot_nodes row.
 *  6. Insert device_credentials row (hash + prefix + topic_prefix).
 *  7. Return credentials + secrets.h content + VPS activation command.
 *
 * ROLLBACK on failure: if step 6 fails, deletes iot_nodes row inserted
 * in step 5 (cascade cleans nothing else since credential not yet stored).
 */
export type ProvisionResult =
  | {
      ok: true;
      device_id: string;
      device_uid: string;
      mqtt_username: string;
      mqtt_password: string; // plaintext — ONE TIME
      mqtt_topic_prefix: string;
      customer_identity_id: string;
      secrets_h_content: string;
      emqx_activation_command: string;
      emqx_activation:
        | { ok: true; user: string; acl_rules: number }
        | { ok: false; error: string };
    }
  | { ok: false; error: string };

export async function provisionDevice(formData: FormData): Promise<ProvisionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };

  const farm_id = String(formData.get("farm_id") ?? "").trim();
  if (!farm_id) return { ok: false, error: "กรุณาเลือกฟาร์ม" };

  try {
    await requireOwnedFarm(supabase, user.id, farm_id);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const check = await canCreateNode(supabase, user.id);
  if (!check.ok) return { ok: false, error: check.reason ?? "เกินโควตาแพ็กเกจ" };

  let common: ReturnType<typeof parseCommonFields>;
  try {
    common = parseCommonFields(formData);
    await validateZoneInFarm(supabase, common.zone_id, farm_id);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  // Resolve customer_identity_id via profile row
  const { data: profile } = await supabase
    .from("profiles")
    .select("customer_identity_id")
    .eq("id", user.id)
    .maybeSingle();
  const customer_identity_id = (profile?.customer_identity_id as string | null) ?? null;
  if (!customer_identity_id) {
    return {
      ok: false,
      error: "profile ยังไม่มี customer_identity_id — โปรดติดต่อผู้ดูแล",
    };
  }

  // Use admin client for device_credentials (RLS restricts writes to service_role)
  const admin = createAdminClient();

  // Step 3: generate unique device_uid
  let device_uid: string;
  try {
    device_uid = await generateUniqueDeviceUid(admin);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  // Step 4: generate credentials
  let creds: ProvisionedCredentials;
  try {
    creds = await generateDeviceCredentials(device_uid, customer_identity_id);
  } catch (e) {
    return { ok: false, error: "credential generation failed: " + (e as Error).message };
  }

  // Step 5: insert iot_nodes (use user session client so RLS enforces ownership)
  const { data: nodeRow, error: nodeErr } = await supabase
    .from("iot_nodes")
    .insert({
      device_uid,
      device_name: common.device_name,
      device_type: common.device_type,
      model: common.model,
      firmware_version: common.firmware_version,
      farm_id,
      zone_id: common.zone_id,
      hardware_model: "SMF-MAIN-V1",
    })
    .select("id")
    .single();

  if (nodeErr || !nodeRow) {
    if (nodeErr?.code === "23505") {
      return { ok: false, error: "device_uid ชนกัน — ลองอีกครั้ง" };
    }
    return { ok: false, error: "insert iot_nodes failed: " + (nodeErr?.message ?? "unknown") };
  }

  const device_id = nodeRow.id as string;

  // Step 6: insert device_credentials (service_role bypasses RLS)
  const { data: credRow, error: credErr } = await admin
    .from("device_credentials")
    .insert({
      device_id,
      mqtt_username: creds.mqtt_username,
      mqtt_password_hash: creds.mqtt_password_hash,
      mqtt_password_prefix: creds.mqtt_password_prefix,
      mqtt_topic_prefix: creds.mqtt_topic_prefix,
      provisioning_status: "pending",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (credErr || !credRow) {
    // ROLLBACK: delete iot_nodes row so retry gets fresh device_uid
    await admin.from("iot_nodes").delete().eq("id", device_id);
    return {
      ok: false,
      error: "insert device_credentials failed: " + (credErr?.message ?? "unknown") + " (rolled back iot_nodes)",
    };
  }

  const credential_id = credRow.id as string;

  // Step 7: activate on EMQX via webhook (creates MQTT user + narrow ACL).
  const activation = await activateOnEmqxWebhook(creds, customer_identity_id);
  if (activation.ok) {
    await admin
      .from("device_credentials")
      .update({ provisioning_status: "active" })
      .eq("id", credential_id);
  } else {
    await admin
      .from("device_credentials")
      .update({
        provisioning_status: "failed",
        provisioning_error: activation.error.slice(0, 500),
      })
      .eq("id", credential_id);
    // Do NOT rollback the DB rows — operator can retry activation via
    // the fallback SSH command. Device is registered but MQTT-inactive.
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/devices");
  revalidatePath(`/dashboard/farms/${farm_id}`);

  return {
    ok: true,
    device_id,
    device_uid,
    mqtt_username: creds.mqtt_username,
    mqtt_password: creds.mqtt_password,
    mqtt_topic_prefix: creds.mqtt_topic_prefix,
    customer_identity_id,
    secrets_h_content: buildSecretsHFile(creds, customer_identity_id),
    emqx_activation_command: buildEmqxActivationCommand(creds, customer_identity_id),
    emqx_activation: activation.ok
      ? { ok: true, user: activation.user, acl_rules: activation.acl_rules }
      : { ok: false, error: activation.error },
  };
}

export async function deleteDevice(deviceId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: current } = await supabase
    .from("iot_nodes")
    .select("farm_id")
    .eq("id", deviceId)
    .maybeSingle();
  if (!current) throw new Error("ไม่พบอุปกรณ์");
  await requireOwnedFarm(supabase, user.id, current.farm_id);

  const { error } = await supabase.from("iot_nodes").delete().eq("id", deviceId);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/devices");
  revalidatePath(`/dashboard/farms/${current.farm_id}/devices`);
  redirect("/dashboard/devices");
}
