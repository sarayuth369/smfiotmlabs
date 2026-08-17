/**
 * Dispatch a command to a device. Authenticated user, must own the device
 * via farm chain. Records to device_commands (audit) and attempts MQTT publish.
 *
 * Publish failure = row stays 'pending' — worker/retry can pick it up.
 */

import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildMqttTopic, publishMqtt } from "@/lib/mqtt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_COMMANDS = new Set([
  "ping",
  "relay_on",
  "relay_off",
  "reboot",
  "config_reload",
]);

type Body = { command: string; payload?: Record<string, unknown> };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ deviceId: string }> }
) {
  const { deviceId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ ok: false, error: "unauthenticated" }, 401);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }
  if (!body.command || !ALLOWED_COMMANDS.has(body.command)) {
    return json({ ok: false, error: "invalid command" }, 400);
  }

  // Ownership check via RLS-scoped read (user client) — returns null if not owned
  const { data: device } = await supabase
    .from("iot_nodes")
    .select("id, device_uid, is_disabled, archived_at")
    .eq("id", deviceId)
    .maybeSingle();
  if (!device) return json({ ok: false, error: "not found" }, 404);
  if (device.is_disabled) return json({ ok: false, error: "device disabled" }, 403);
  if (device.archived_at) return json({ ok: false, error: "device archived" }, 403);

  const commandId = randomUUID();
  const admin = createAdminClient();

  const { error: insErr } = await admin.from("device_commands").insert({
    id: commandId,
    device_id: device.id,
    user_id: user.id,
    command: body.command,
    payload: body.payload ?? {},
    status: "pending",
  });
  if (insErr) return json({ ok: false, error: "insert failed", detail: insErr.message }, 500);

  const topic = buildMqttTopic(device.device_uid as string, "command");
  const pub = await publishMqtt(topic, {
    command_id: commandId,
    command: body.command,
    payload: body.payload ?? {},
    timestamp: new Date().toISOString(),
  });

  if (pub.ok) {
    await admin
      .from("device_commands")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", commandId);
  }
  // If publish failed, row stays pending — worker/retry cron picks it up.

  return json({
    ok: true,
    command_id: commandId,
    status: pub.ok ? "sent" : "pending",
    publish_error: pub.ok ? undefined : pub.error,
  });
}
