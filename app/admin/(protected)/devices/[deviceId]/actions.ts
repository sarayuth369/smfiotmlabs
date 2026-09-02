"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";
import { publishToDevice } from "@/lib/device-mqtt";
import { ADMIN_COMMAND_TYPES, type AdminCommandType } from "@/lib/device-commands";

export type SendCommandResult =
  | { ok: true; command_id: string; debug?: Record<string, unknown> }
  | { ok: false; error: string; debug?: Record<string, unknown> };

/**
 * Every server-side command send verifies: admin session (requireModule),
 * device exists, and command_type is in the strict allowlist — never
 * accepts an arbitrary MQTT topic or payload from the browser. MQTT
 * publish happens here, server-side only (via the same
 * provisioning-webhook path the working OTA/relay features already use —
 * EMQX credentials never reach the browser).
 */
export async function sendAdminDeviceCommand(
  deviceId: string,
  commandType: string
): Promise<SendCommandResult> {
  const session = await requireModule("devices");
  if (!ADMIN_COMMAND_TYPES.includes(commandType as AdminCommandType)) {
    return { ok: false, error: "invalid command_type" };
  }

  const admin = createAdminClient();
  const { data: device } = await admin
    .from("iot_nodes")
    .select("id, device_uid, farm_id, is_disabled, archived_at")
    .eq("id", deviceId)
    .maybeSingle();
  if (!device) return { ok: false, error: "device not found" };
  if (device.is_disabled) return { ok: false, error: "device disabled" };
  if (device.archived_at) return { ok: false, error: "device archived" };

  const { data: farm } = await admin.from("farms").select("user_id").eq("id", device.farm_id as string).maybeSingle();
  const { data: profile } = await admin
    .from("profiles")
    .select("customer_identity_id")
    .eq("id", (farm?.user_id as string) ?? "")
    .maybeSingle();
  const customerUuid = profile?.customer_identity_id as string | null;
  if (!customerUuid) return { ok: false, error: "device owner missing customer_identity_id" };

  const commandId = randomUUID();
  const { error: insErr, status: insStatusCode } = await admin.from("device_commands").insert({
    id: commandId,
    device_id: device.id,
    user_id: null,
    requested_by: session.username,
    command: commandType,
    payload: {},
    status: "pending",
  });
  if (insErr) {
    return {
      ok: false,
      error: insErr.message,
      debug: { stage: "insert", insErr, insStatusCode, commandId, deviceRowId: device.id },
    };
  }

  // TEMP diagnostic — confirms the row actually landed before we even try
  // to publish, since the client is currently reporting success while the
  // row seems to never appear in the history table.
  const { data: verifyRow, error: verifyErr } = await admin
    .from("device_commands")
    .select("id, device_id, status")
    .eq("id", commandId)
    .maybeSingle();

  // TEMP diagnostic — exact same query shape the list/history routes run,
  // executed right here in the same action, to see whether a list query
  // scoped by device_id finds this row (vs. only a lookup-by-id working).
  const { data: listRows, error: listErr } = await admin
    .from("device_commands")
    .select("id, command, status, requested_at")
    .eq("device_id", device.id)
    .order("requested_at", { ascending: false })
    .limit(20);

  const publish = await publishToDevice(customerUuid, device.device_uid as string, "admin_cmd", {
    command_id: commandId,
    command_type: commandType,
  });
  if (!publish.ok) {
    await admin
      .from("device_commands")
      .update({ status: "failed", error_message: publish.error, completed_at: new Date().toISOString() })
      .eq("id", commandId);
    revalidatePath(`/admin/devices/${deviceId}`);
    return { ok: false, error: publish.error, debug: { stage: "publish", commandId, verifyRow, verifyErr } };
  }

  await admin.from("device_commands").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", commandId);
  revalidatePath(`/admin/devices/${deviceId}`);
  return {
    ok: true,
    command_id: commandId,
    debug: { commandId, deviceRowId: device.id, verifyRow, verifyErr, listRowCount: listRows?.length ?? null, listErr, listRows },
  };
}
