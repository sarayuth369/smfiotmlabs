/**
 * Telemetry ingestion endpoint. Called by the MQTT worker (separate service).
 *
 * Auth: HMAC-SHA256 of raw body using shared TELEMETRY_INGEST_SECRET.
 * Not user-facing — worker owns the credential.
 *
 * Idempotent via (sensor_id, message_id) partial UNIQUE.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateReadingAgainstRules } from "@/lib/automation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Reading = {
  sensor_type: string;
  channel?: string | null;
  value: number;
  unit?: string | null;
  message_id?: string | null;
};

type Payload = {
  device_uid: string;
  occurred_at: string;
  readings: Reading[];
};

function json(body: unknown, status: number = 200) {
  return NextResponse.json(body, { status });
}

function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(header, "utf-8");
  const b = Buffer.from(expected, "utf-8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const secret = process.env.TELEMETRY_INGEST_SECRET;
  if (!secret) return json({ ok: false, error: "server misconfigured" }, 500);

  const rawBody = await req.text();
  const sig = req.headers.get("x-ingest-signature");
  if (!verifySignature(rawBody, sig, secret)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let body: Payload;
  try {
    body = JSON.parse(rawBody) as Payload;
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }

  if (!body.device_uid || !body.occurred_at || !Array.isArray(body.readings) || body.readings.length === 0) {
    return json({ ok: false, error: "missing device_uid / occurred_at / readings" }, 400);
  }
  if (body.readings.length > 100) {
    return json({ ok: false, error: "batch too large (max 100)" }, 400);
  }

  // Basic timestamp sanity — reject > 5 min in future or > 30 days in past
  const occurred = new Date(body.occurred_at).getTime();
  if (!Number.isFinite(occurred)) return json({ ok: false, error: "invalid occurred_at" }, 400);
  const now = Date.now();
  if (occurred > now + 5 * 60_000) return json({ ok: false, error: "occurred_at in future" }, 400);
  if (occurred < now - 30 * 86_400_000) return json({ ok: false, error: "occurred_at too old" }, 400);

  const admin = createAdminClient();

  const { data: device, error: devErr } = await admin
    .from("iot_nodes")
    .select("id, is_disabled, archived_at")
    .eq("device_uid", body.device_uid)
    .maybeSingle();
  if (devErr || !device) return json({ ok: false, error: "unknown device" }, 404);
  if (device.is_disabled) return json({ ok: false, error: "device disabled" }, 403);
  if (device.archived_at) return json({ ok: false, error: "device archived" }, 403);

  // Resolve sensor identity per (sensor_type, channel) → sensors.id (active only)
  const { data: sensorRows } = await admin
    .from("sensors")
    .select("id, sensor_type, channel")
    .eq("device_id", device.id)
    .is("archived_at", null);
  const sensors = sensorRows ?? [];

  type Row = {
    sensor_id: string;
    device_id: string;
    value: number;
    unit: string | null;
    occurred_at: string;
    message_id: string | null;
  };
  const rows: Row[] = [];
  const rejected: { reading: Reading; reason: string }[] = [];

  for (const r of body.readings) {
    if (typeof r.value !== "number" || !Number.isFinite(r.value)) {
      rejected.push({ reading: r, reason: "invalid value" });
      continue;
    }
    const match = sensors.find(
      (s) => s.sensor_type === r.sensor_type && (s.channel ?? null) === (r.channel ?? null)
    );
    if (!match) {
      rejected.push({ reading: r, reason: "unknown sensor" });
      continue;
    }
    rows.push({
      sensor_id: match.id as string,
      device_id: device.id as string,
      value: r.value,
      unit: r.unit ?? null,
      occurred_at: body.occurred_at,
      message_id: r.message_id ?? null,
    });
  }

  let inserted = 0;
  if (rows.length > 0) {
    // upsert on (sensor_id, message_id) — ignore duplicates
    const { error: insErr, count } = await admin
      .from("sensor_readings")
      .upsert(rows, { onConflict: "sensor_id,message_id", ignoreDuplicates: true, count: "exact" });
    if (insErr) return json({ ok: false, error: "insert failed", detail: insErr.message }, 500);
    inserted = count ?? rows.length;
  }

  // Update device last_seen + status='online' + fire connected event if was offline
  await admin
    .from("iot_nodes")
    .update({ last_seen: new Date().toISOString(), status: "online" })
    .eq("id", device.id);

  // Run automation rule engine — evaluate each reading against sensor_value rules
  let automation = { evaluated: 0, executed: 0, skipped: 0, failed: 0 };
  for (const row of rows) {
    const sensor = sensors.find((s) => s.id === row.sensor_id);
    if (!sensor) continue;
    try {
      const r = await evaluateReadingAgainstRules(admin, {
        sensor_id: row.sensor_id,
        device_id: row.device_id,
        device_uid: body.device_uid,
        sensor_type: sensor.sensor_type as string,
        channel: (sensor.channel as string | null) ?? null,
        value: row.value,
        occurred_at: row.occurred_at,
      });
      automation.evaluated += r.evaluated;
      automation.executed += r.executed;
      automation.skipped += r.skipped;
      automation.failed += r.failed;
    } catch (e) {
      // Never let rule-engine failure poison ingestion
      console.warn("[telemetry.ingest] rule engine error", (e as Error).message);
    }
  }

  return json({
    ok: true,
    device_uid: body.device_uid,
    inserted,
    rejected: rejected.length,
    rejectedDetail: rejected.slice(0, 5),
    automation,
  });
}
