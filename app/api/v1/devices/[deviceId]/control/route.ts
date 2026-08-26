import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { authenticateApiRequest, requirePermission, resolveScopedDevice, logApiEvent, apiErrorResponse } from "@/lib/api-auth";
import { publishToDevice } from "@/lib/device-mqtt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Only a fixed, safe command set — never an arbitrary MQTT topic/payload
// from the caller. relay_set maps 1:1 onto the same "relay_cmd" kind the
// dashboard's Controls tab already uses (lib/device-mqtt.ts).
type RelaySetBody = { command: "relay_set"; channel: number; state: boolean };

function isRelaySetBody(x: unknown): x is RelaySetBody {
  if (!x || typeof x !== "object") return false;
  const b = x as Record<string, unknown>;
  return b.command === "relay_set" && Number.isInteger(b.channel) && (b.channel as number) >= 1 && (b.channel as number) <= 4 && typeof b.state === "boolean";
}

export async function POST(req: Request, { params }: { params: Promise<{ deviceId: string }> }) {
  const auth = await authenticateApiRequest(req);
  if (!auth.ok) return apiErrorResponse(auth);
  const { ctx } = auth;

  const permErr = requirePermission(ctx, "CONTROL_DEVICES");
  if (permErr) return apiErrorResponse(permErr);

  const { deviceId } = await params;
  const resolved = await resolveScopedDevice(ctx, deviceId);
  if (!resolved.ok) return apiErrorResponse(resolved);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }
  if (!isRelaySetBody(body)) {
    return NextResponse.json(
      { error: "unsupported command — expected { command: 'relay_set', channel: 1-4, state: boolean }" },
      { status: 400 }
    );
  }

  const { data: profile } = await ctx.admin
    .from("profiles")
    .select("customer_identity_id")
    .eq("id", ctx.userId)
    .maybeSingle();
  const customerUuid = profile?.customer_identity_id as string | null;
  if (!customerUuid) return NextResponse.json({ error: "account is not provisioned for MQTT" }, { status: 409 });

  const commandId = randomUUID();
  await ctx.admin.from("device_commands").insert({
    id: commandId,
    device_id: deviceId,
    user_id: ctx.userId,
    command: body.command,
    payload: { channel: body.channel, state: body.state, triggered_by: "api", api_key_id: ctx.apiKeyId },
    status: "pending",
  });

  const result = await publishToDevice(
    customerUuid,
    resolved.device.device_uid,
    "relay_cmd",
    { state: body.state },
    { channel: body.channel, retain: false }
  );

  await ctx.admin
    .from("device_commands")
    .update({ status: result.ok ? "sent" : "failed", sent_at: result.ok ? new Date().toISOString() : null })
    .eq("id", commandId);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  await logApiEvent(ctx.admin, ctx.userId, ctx.apiKeyId, "control_command", { command_id: commandId, device_id: deviceId, ...body, ok: result.ok }, ip);

  if (!result.ok) return NextResponse.json({ error: result.error ?? "publish failed", command_id: commandId }, { status: 502 });

  return NextResponse.json({ ok: true, command_id: commandId });
}
