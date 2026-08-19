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
import {
  checkDeviceRateLimit,
  checkCustomerRateLimit,
  checkIpRateLimit,
  checkInvalidRequestLimit,
  RATE_LIMIT_CONFIG,
} from "@/lib/rate-limit";

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
  readings?: Reading[];
  // New multi-tenant fields (Phase 4.3) — optional for legacy compat
  customer_identity_id?: string | null;
  topic_namespace?: "legacy" | "new" | null;
  event_type?: string | null;
  status?: string | null;
  firmware_version?: string | null;
  metadata?: Record<string, unknown> | null;
  response?: unknown;
  payload?: unknown;
};

function json(body: unknown, status: number = 200, headers?: Record<string, string>) {
  return NextResponse.json(body, { status, headers });
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

  // IP for invalid-request throttling (from Vercel edge / reverse proxy)
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const rawBody = await req.text();

  // Enforce max payload BEFORE any expensive work
  if (rawBody.length > RATE_LIMIT_CONFIG.maxPayloadBytes) {
    await checkInvalidRequestLimit(ip); // count against abuse bucket
    return json({ ok: false, error: "payload too large" }, 413);
  }

  const sig = req.headers.get("x-ingest-signature");
  if (!verifySignature(rawBody, sig, secret)) {
    // Auth failure — hit invalid bucket (aggressive limit to stop credential-guessing flood)
    const invalid = await checkInvalidRequestLimit(ip);
    if (!invalid.ok) {
      return json(
        { ok: false, error: "too many invalid requests" },
        429,
        { "retry-after": String(invalid.retryAfterSec) }
      );
    }
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let body: Payload;
  try {
    body = JSON.parse(rawBody) as Payload;
  } catch {
    return json({ ok: false, error: "invalid json" }, 400);
  }

  if (!body.device_uid || !body.occurred_at) {
    return json({ ok: false, error: "missing device_uid / occurred_at" }, 400);
  }

  // Rate limit — per-IP (Bridge IP), per-device, per-customer.
  // Priority: device most specific, IP catches bridge misbehavior, customer caps whole tenant.
  const ipLimit = await checkIpRateLimit(ip);
  if (!ipLimit.ok) {
    console.warn("[rate-limit] ip throttled", ip);
    return json(
      { ok: false, error: "rate limit exceeded" },
      429,
      { "retry-after": String(ipLimit.retryAfterSec) }
    );
  }
  const deviceLimit = await checkDeviceRateLimit(body.device_uid);
  if (!deviceLimit.ok) {
    console.warn("[rate-limit] device throttled", body.device_uid);
    return json(
      { ok: false, error: "rate limit exceeded" },
      429,
      { "retry-after": String(deviceLimit.retryAfterSec) }
    );
  }
  if (body.customer_identity_id) {
    const custLimit = await checkCustomerRateLimit(body.customer_identity_id);
    if (!custLimit.ok) {
      console.warn("[rate-limit] customer throttled", body.customer_identity_id);
      return json(
        { ok: false, error: "rate limit exceeded" },
        429,
        { "retry-after": String(custLimit.retryAfterSec) }
      );
    }
  }
  const isStatusOnly = !body.readings || body.readings.length === 0;
  if (!isStatusOnly && body.readings!.length > 100) {
    return json({ ok: false, error: "batch too large (max 100)" }, 400);
  }
  if (isStatusOnly && !body.event_type) {
    return json({ ok: false, error: "missing readings or event_type" }, 400);
  }

  // Basic timestamp sanity — reject > 5 min in future or > 30 days in past
  const occurred = new Date(body.occurred_at).getTime();
  if (!Number.isFinite(occurred)) return json({ ok: false, error: "invalid occurred_at" }, 400);
  const now = Date.now();
  if (occurred > now + 5 * 60_000) return json({ ok: false, error: "occurred_at in future" }, 400);
  if (occurred < now - 30 * 86_400_000) return json({ ok: false, error: "occurred_at too old" }, 400);

  const admin = createAdminClient();

  // Resolve device + owner chain. If caller (bridge) provided customer_identity_id
  // from the MQTT topic, cross-check against actual device owner — reject mismatch.
  const { data: device, error: devErr } = await admin
    .from("iot_nodes")
    .select("id, is_disabled, archived_at, farm_id, farms!inner(user_id, profiles!inner(customer_identity_id))")
    .eq("device_uid", body.device_uid)
    .maybeSingle();
  if (devErr || !device) return json({ ok: false, error: "unknown device" }, 404);
  if (device.is_disabled) return json({ ok: false, error: "device disabled" }, 403);
  if (device.archived_at) return json({ ok: false, error: "device archived" }, 403);

  // Ownership cross-check (multi-tenant safety) — only enforced when bridge sent it
  if (body.customer_identity_id) {
    const farmsRel = (device as unknown as { farms?: { profiles?: { customer_identity_id?: string | null } } | { profiles?: { customer_identity_id?: string | null } }[] }).farms;
    const farm = Array.isArray(farmsRel) ? farmsRel[0] : farmsRel;
    const profile = Array.isArray(farm?.profiles) ? farm.profiles[0] : farm?.profiles;
    const actualCustomerId = profile?.customer_identity_id ?? null;
    if (!actualCustomerId || actualCustomerId !== body.customer_identity_id) {
      console.warn(
        "[security] ownership mismatch",
        "topic_customer=",
        body.customer_identity_id,
        "actual_customer=",
        actualCustomerId,
        "device_uid=",
        body.device_uid
      );
      return json({ ok: false, error: "customer/device ownership mismatch" }, 403);
    }
  }

  // Status-only event (heartbeat / connect / disconnect) — update last_seen + optional firmware
  if (isStatusOnly) {
    const patch: Record<string, unknown> = {
      last_seen: new Date().toISOString(),
    };
    if (body.status === "online" || body.status === "offline" || body.status === "warning") {
      patch.status = body.status;
    } else {
      patch.status = "online"; // any event = device is alive
    }
    if (typeof body.firmware_version === "string") {
      patch.firmware_version = body.firmware_version;
    }
    await admin.from("iot_nodes").update(patch).eq("id", device.id);
    await admin.from("device_events").insert({
      device_id: device.id,
      event_type: body.event_type ?? "heartbeat",
      payload: { status: body.status, metadata: body.metadata ?? null },
    });
    return json({
      ok: true,
      device_uid: body.device_uid,
      event: body.event_type,
      status_updated: true,
    });
  }

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

  for (const r of body.readings!) {
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
    // Plain insert. PostgREST upsert with partial unique index (WHERE message_id IS NOT NULL)
    // fails with "no unique or exclusion constraint matching ON CONFLICT" — bridge already
    // generates fresh message_id per POST so duplicates are not expected in practice.
    // If duplicates from broker retries do occur, catch 23505 unique-violation and ignore.
    const { error: insErr, count } = await admin
      .from("sensor_readings")
      .insert(rows, { count: "exact" });
    if (insErr) {
      // 23505 = unique constraint violation (message_id collision) — safe to ignore
      if (insErr.code !== "23505") {
        return json({ ok: false, error: "insert failed", detail: insErr.message }, 500);
      }
    }
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
