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
import { dispatchWebhookEvent } from "@/lib/webhooks";
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

  // Resolve device — simple lookup by device_uid. Ownership cross-check
  // done as separate query only when caller provided customer_identity_id.
  const { data: device, error: devErr } = await admin
    .from("iot_nodes")
    .select("id, is_disabled, archived_at, farm_id, last_seen")
    .eq("device_uid", body.device_uid)
    .maybeSingle();
  if (devErr || !device) {
    console.warn("[ingest] unknown device", body.device_uid, devErr?.message);
    return json({ ok: false, error: "unknown device" }, 404);
  }
  if (device.is_disabled) return json({ ok: false, error: "device disabled" }, 403);
  if (device.archived_at) return json({ ok: false, error: "device archived" }, 403);

  // Phase 6.13 — was this device offline before THIS message? (checked
  // before any update below overwrites last_seen). Only matters for the
  // rare "device_online" webhook case, so it's computed once here and
  // resolved (farm -> user_id, only if actually needed) close to each
  // dispatch call rather than unconditionally on every request.
  const dev = device; // re-bind so TS keeps the non-null narrowing inside the closure below
  const wasOffline =
    !dev.last_seen || Date.now() - new Date(dev.last_seen as string).getTime() > 60_000;
  async function notifyDeviceOnline() {
    if (!wasOffline) return;
    const { data: farm } = await admin.from("farms").select("user_id").eq("id", dev.farm_id as string).maybeSingle();
    if (!farm?.user_id) return;
    await dispatchWebhookEvent(admin, farm.user_id as string, "device_online", {
      device_id: dev.id,
      device_uid: body.device_uid,
      occurred_at: new Date().toISOString(),
    });
  }

  // Ownership cross-check (multi-tenant safety) — 2-step resolve to avoid
  // fragile PostgREST embeds. Only enforced when bridge sent customer_identity_id.
  if (body.customer_identity_id) {
    const { data: farm } = await admin
      .from("farms")
      .select("user_id")
      .eq("id", device.farm_id as string)
      .maybeSingle();
    let actualCustomerId: string | null = null;
    if (farm?.user_id) {
      const { data: prof } = await admin
        .from("profiles")
        .select("customer_identity_id")
        .eq("id", farm.user_id as string)
        .maybeSingle();
      actualCustomerId = (prof?.customer_identity_id as string | null) ?? null;
    }
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
    const metaRssi = (body.metadata as Record<string, unknown> | null)?.rssi;
    if (typeof metaRssi === "number") {
      patch.rssi = metaRssi;
    }
    await admin.from("iot_nodes").update(patch).eq("id", device.id);

    // Reconcile any stuck OTA job against the version this heartbeat just
    // reported. The device's own event/ota "success" report can get lost
    // in the brief window right after an OTA reboot reconnects (observed
    // in practice — MQTT session still settling); the regular heartbeat
    // firmware_version is far more reliable, so use it as a backstop: if
    // it already matches an in-flight job's target, that job is done,
    // regardless of whether its own success event ever arrived.
    if (typeof body.firmware_version === "string") {
      const { data: pendingJob } = await admin
        .from("firmware_update_jobs")
        .select("id, to_version")
        .eq("device_id", device.id)
        .eq("to_version", body.firmware_version)
        .in("state", ["requested", "downloading", "verifying", "installing", "rebooting", "health_check"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pendingJob) {
        await admin
          .from("firmware_update_jobs")
          .update({ state: "success", progress: 100, completed_at: new Date().toISOString() })
          .eq("id", pendingJob.id);
      }
    }

    await admin.from("device_events").insert({
      device_id: device.id,
      event_type: body.event_type ?? "heartbeat",
      payload: { status: body.status, metadata: body.metadata ?? null },
    });
    await notifyDeviceOnline();

    // OTA progress/result — bridge forwards smf/{c}/{d}/event/ota as
    // event_type:"ota" (same convention as event/relay/{N} -> "relay").
    // Additive only: never touches the generic device_events path above.
    if (body.event_type === "ota") {
      // Generic event/{subtype} topics arrive as `payload` (see
      // bridge.js's `parsed.kind === "event"` branch), not `metadata` —
      // `metadata` is only populated on the status-heartbeat path above.
      const meta = (body.payload ?? body.metadata ?? {}) as Record<string, unknown>;
      const releaseId = typeof meta.release_id === "string" ? meta.release_id : null;
      const state = typeof meta.state === "string" ? meta.state : null;
      const progress = typeof meta.progress === "number" ? meta.progress : null;
      const error = typeof meta.error === "string" ? meta.error : null;

      if (releaseId && state) {
        const { data: job } = await admin
          .from("firmware_update_jobs")
          .select("id")
          .eq("device_id", device.id)
          .eq("firmware_release_id", releaseId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (job) {
          const isTerminal = state === "success" || state === "failed";
          await admin
            .from("firmware_update_jobs")
            .update({
              state,
              progress,
              error_message: error,
              ...(isTerminal ? { completed_at: new Date().toISOString() } : {}),
            })
            .eq("id", job.id);
          await admin.from("firmware_update_events").insert({
            job_id: job.id,
            device_id: device.id,
            state,
            progress,
            message: error,
          });
        } else {
          console.warn("[ingest] ota event for unknown job", device.id, releaseId, state);
        }
      }
    }
    // Only dispatch for a firmware-named event, never the generic
    // heartbeat fallback — heartbeats fire too often to be a useful webhook.
    if (body.event_type) {
      const { data: farm } = await admin.from("farms").select("user_id").eq("id", device.farm_id as string).maybeSingle();
      if (farm?.user_id) {
        await dispatchWebhookEvent(admin, farm.user_id as string, "device_event", {
          device_id: device.id,
          device_uid: body.device_uid,
          event_type: body.event_type,
          metadata: body.metadata ?? null,
          occurred_at: new Date().toISOString(),
        });
      }
    }
    return json({
      ok: true,
      device_uid: body.device_uid,
      event: body.event_type,
      status_updated: true,
    });
  }

  // Resolve sensor identity per (sensor_type, channel) → sensors.id (active only)
  // Phase 6.9b: record_history + history_interval_minutes gate whether a
  // reading also gets a durable row in sensor_readings (see below) — the
  // realtime path (sensor_readings_latest) never depends on this flag.
  const { data: sensorRows } = await admin
    .from("sensors")
    .select("id, sensor_type, channel, record_history, history_interval_minutes")
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

  // Phase 6.9b: realtime "current value" ALWAYS updates, regardless of the
  // history opt-in. sensor_readings_latest used to be kept fresh only as a
  // side effect of the sync_sensor_readings_latest AFTER-INSERT trigger on
  // sensor_readings — which meant realtime display would have silently
  // broken the moment we stopped inserting every reading into history.
  // Upserting it here directly decouples the two, matching the trigger's
  // own upsert shape (on conflict (sensor_id)).
  if (rows.length > 0) {
    const { error: latestErr } = await admin.from("sensor_readings_latest").upsert(
      rows.map((r) => ({
        sensor_id: r.sensor_id,
        device_id: r.device_id,
        value: r.value,
        unit: r.unit,
        occurred_at: r.occurred_at,
        received_at: new Date().toISOString(),
      })),
      { onConflict: "sensor_id" }
    );
    if (latestErr) {
      console.warn("[telemetry.ingest] sensor_readings_latest upsert failed", latestErr.message);
    }
  }

  // Phase 6.9b: durable history is OPT-IN per sensor + sampled at the
  // sensor's configured interval — NOT one row per telemetry message.
  // Only sensors with record_history=true are even considered; for those,
  // an entitlement check (plan must allow "sensor_history") runs ONCE per
  // request (not per reading), and a per-sensor "last sample" lookup
  // (indexed via sensor_readings_sensor_occurred_idx) enforces the
  // interval before a new row is written.
  const historyEligibleSensorIds = [
    ...new Set(
      rows
        .map((r) => sensors.find((s) => s.id === r.sensor_id))
        .filter((s): s is NonNullable<typeof s> => !!s && s.record_history === true)
        .map((s) => s.id as string)
    ),
  ];

  let historyRows: Row[] = [];
  if (historyEligibleSensorIds.length > 0) {
    let planAllowsHistory = false;
    const { data: farm } = await admin
      .from("farms")
      .select("user_id")
      .eq("id", device.farm_id as string)
      .maybeSingle();
    if (farm?.user_id) {
      const { data: profile } = await admin
        .from("profiles")
        .select("plan")
        .eq("id", farm.user_id as string)
        .maybeSingle();
      const { data: planRow } = await admin
        .from("subscription_plans")
        .select("entitlements")
        .eq("plan_id", (profile?.plan as string) ?? "starter")
        .maybeSingle();
      const ent = planRow?.entitlements as Record<string, unknown> | null;
      planAllowsHistory = !!ent?.sensor_history;
    }

    if (planAllowsHistory) {
      const nowMs = Date.now();
      const lastSampleAt = new Map<string, number>();
      await Promise.all(
        historyEligibleSensorIds.map(async (sid) => {
          const { data: last } = await admin
            .from("sensor_readings")
            .select("occurred_at")
            .eq("sensor_id", sid)
            .order("occurred_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (last?.occurred_at) {
            lastSampleAt.set(sid, new Date(last.occurred_at as string).getTime());
          }
        })
      );

      historyRows = rows.filter((r) => {
        const sensor = sensors.find((s) => s.id === r.sensor_id);
        if (!sensor?.record_history) return false;
        const last = lastSampleAt.get(r.sensor_id);
        if (last === undefined) return true; // first-ever sample — always record
        const intervalMs = (sensor.history_interval_minutes as number) * 60_000;
        return nowMs - last >= intervalMs;
      });
    }
  }

  let inserted = 0;
  if (historyRows.length > 0) {
    // Plain insert. PostgREST upsert with partial unique index (WHERE message_id IS NOT NULL)
    // fails with "no unique or exclusion constraint matching ON CONFLICT" — bridge already
    // generates fresh message_id per POST so duplicates are not expected in practice.
    // If duplicates from broker retries do occur, catch 23505 unique-violation and ignore.
    const { error: insErr, count } = await admin
      .from("sensor_readings")
      .insert(historyRows, { count: "exact" });
    if (insErr) {
      // 23505 = unique constraint violation (message_id collision) — safe to ignore
      if (insErr.code !== "23505") {
        return json({ ok: false, error: "insert failed", detail: insErr.message }, 500);
      }
    }
    inserted = count ?? historyRows.length;
  }

  // Update device last_seen + status='online' + fire connected event if was offline
  await admin
    .from("iot_nodes")
    .update({ last_seen: new Date().toISOString(), status: "online" })
    .eq("id", device.id);
  await notifyDeviceOnline();

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
