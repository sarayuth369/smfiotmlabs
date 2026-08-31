/**
 * Device Health & Monitoring v1.0 — central engine. All health decisions
 * live here; nothing else (ingest route, cron, UI) computes status itself.
 *
 * Reuses lib/device-status.ts's computeDeviceStatus() as the single
 * definition of device connectivity — do not duplicate that logic here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeDeviceStatus } from "@/lib/device-status";

export type HealthStatus = "healthy" | "warning" | "critical" | "offline";
export type IssueSeverity = "info" | "warning" | "critical";

export type HealthIssue = {
  type: string; // "offline" | "sensor_stale" | "sensor_missing_data" | "ota_failed" | ... (open-ended)
  severity: IssueSeverity;
  message: string;
  sensor_id?: string;
};

export type DeviceHealthResult = {
  device_id: string;
  status: HealthStatus;
  health_score: number;
  last_seen_at: string | null;
  last_telemetry_at: string | null;
  mqtt_status: string | null;
  sensor_status: "ok" | "issues" | "no_sensors" | null;
  firmware_version: string | null;
  issues: HealthIssue[];
  metrics: Record<string, unknown>;
};

// Centralized, not scattered through UI/other modules.
const SENSOR_STALE_THRESHOLD_SEC = 300; // 5 min — generous vs. the 60s connectivity threshold
const SCORE_DEDUCT = { warning: 15, critical: 35 } as const;

/**
 * Pure evaluation — reads current state, returns a structured result.
 * Never writes. Safe to call from ingest (event-driven) or a sweep.
 */
export async function evaluateDeviceHealth(
  admin: SupabaseClient,
  deviceId: string
): Promise<DeviceHealthResult | null> {
  const { data: device } = await admin
    .from("iot_nodes")
    .select("id, status, last_seen, firmware_version, archived_at")
    .eq("id", deviceId)
    .maybeSingle();
  if (!device || device.archived_at) return null;

  const lastSeen = device.last_seen as string | null;
  const connectivity = computeDeviceStatus(device.status as string | null, lastSeen);
  const issues: HealthIssue[] = [];

  if (connectivity === "offline" || connectivity === "never_connected") {
    issues.push({ type: "offline", severity: "critical", message: "อุปกรณ์ออฟไลน์ — ไม่มี heartbeat ตามเวลาที่กำหนด" });
  } else if (connectivity === "warning") {
    issues.push({ type: "mqtt_warning", severity: "warning", message: "สถานะ MQTT รายงานเป็น warning" });
  }

  // Sensor staleness/missing-data — only for sensors actually assigned to
  // this device (never assume a device has sensors), and only meaningful
  // while the device itself is reachable (an offline device already
  // explains every sensor being stale — avoid double-flagging).
  let sensorStatus: DeviceHealthResult["sensor_status"] = null;
  let lastTelemetryAt: string | null = null;
  const { data: sensors } = await admin
    .from("sensors")
    .select("id, name")
    .eq("device_id", deviceId)
    .is("archived_at", null);

  if (!sensors || sensors.length === 0) {
    sensorStatus = "no_sensors";
  } else {
    const sensorIds = sensors.map((s) => s.id as string);
    const { data: latest } = await admin
      .from("sensor_readings_latest")
      .select("sensor_id, occurred_at")
      .in("sensor_id", sensorIds);
    const latestBySensor = new Map((latest ?? []).map((r) => [r.sensor_id as string, r.occurred_at as string]));

    for (const row of latest ?? []) {
      const t = new Date(row.occurred_at as string).getTime();
      if (Number.isFinite(t) && (!lastTelemetryAt || t > new Date(lastTelemetryAt).getTime())) {
        lastTelemetryAt = row.occurred_at as string;
      }
    }

    let anyIssue = false;
    if (connectivity === "online" || connectivity === "warning") {
      for (const s of sensors) {
        const occurredAt = latestBySensor.get(s.id as string);
        if (!occurredAt) {
          issues.push({ type: "sensor_missing_data", severity: "warning", sensor_id: s.id as string, message: `เซนเซอร์ "${s.name}" ยังไม่เคยส่งค่า` });
          anyIssue = true;
          continue;
        }
        const ageSec = (Date.now() - new Date(occurredAt).getTime()) / 1000;
        if (ageSec > SENSOR_STALE_THRESHOLD_SEC) {
          issues.push({ type: "sensor_stale", severity: "warning", sensor_id: s.id as string, message: `เซนเซอร์ "${s.name}" ไม่มีค่าใหม่มา ${Math.round(ageSec / 60)} นาที` });
          anyIssue = true;
        }
      }
    }
    sensorStatus = anyIssue ? "issues" : "ok";
  }

  // OTA — only a reliable signal we already have: a recent failed/rolled-back
  // job with no later success. Cheap (one indexed query), skipped entirely
  // if the table doesn't exist yet in an older deployment.
  try {
    const { data: lastJob } = await admin
      .from("firmware_update_jobs")
      .select("state, created_at")
      .eq("device_id", deviceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastJob && (lastJob.state === "failed" || lastJob.state === "rolled_back")) {
      issues.push({ type: "ota_failed", severity: "warning", message: "การอัปเดตเฟิร์มแวร์ล่าสุดล้มเหลว" });
    }
  } catch {
    // firmware_update_jobs not present — fine, OTA health simply unavailable
  }

  // Score + status — offline overrides everything (spec: offline = 0).
  let status: HealthStatus;
  let score: number;
  if (connectivity === "offline" || connectivity === "never_connected") {
    status = "offline";
    score = 0;
  } else {
    score = 100;
    for (const i of issues) score -= SCORE_DEDUCT[i.severity === "critical" ? "critical" : "warning"];
    score = Math.max(0, score);
    const hasCritical = issues.some((i) => i.severity === "critical");
    const hasWarning = issues.some((i) => i.severity === "warning");
    status = hasCritical ? "critical" : hasWarning ? "warning" : "healthy";
  }

  return {
    device_id: deviceId,
    status,
    health_score: score,
    last_seen_at: lastSeen,
    last_telemetry_at: lastTelemetryAt,
    mqtt_status: connectivity,
    sensor_status: sensorStatus,
    firmware_version: (device.firmware_version as string | null) ?? null,
    issues,
    metrics: {},
  };
}

/**
 * Evaluate + upsert current state, logging a device_health_events row
 * only on a meaningful change (status transition, or the active issue
 * set actually changed) — never one event per telemetry packet.
 */
export async function applyDeviceHealth(admin: SupabaseClient, deviceId: string): Promise<void> {
  const result = await evaluateDeviceHealth(admin, deviceId);
  if (!result) return;

  const { data: prev } = await admin
    .from("device_health")
    .select("status, issues")
    .eq("device_id", deviceId)
    .maybeSingle();

  await admin.from("device_health").upsert(
    {
      device_id: result.device_id,
      status: result.status,
      health_score: result.health_score,
      last_seen_at: result.last_seen_at,
      last_telemetry_at: result.last_telemetry_at,
      mqtt_status: result.mqtt_status,
      sensor_status: result.sensor_status,
      firmware_version: result.firmware_version,
      issues: result.issues,
      metrics: result.metrics,
      last_evaluated_at: new Date().toISOString(),
    },
    { onConflict: "device_id" }
  );

  const prevStatus = (prev?.status as HealthStatus | undefined) ?? null;
  const prevIssueTypes = new Set(((prev?.issues as HealthIssue[] | null) ?? []).map((i) => i.type + (i.sensor_id ?? "")));
  const newIssueTypes = new Set(result.issues.map((i) => i.type + (i.sensor_id ?? "")));

  const statusChanged = prevStatus !== null && prevStatus !== result.status;
  const issuesChanged =
    prevIssueTypes.size !== newIssueTypes.size || [...newIssueTypes].some((k) => !prevIssueTypes.has(k));

  if (prevStatus === null) {
    // First-ever evaluation for this device — one baseline event, not spam.
    await insertEvent(admin, deviceId, null, result.status, "initial_evaluation", "info", "เริ่มติดตามสถานะอุปกรณ์");
    return;
  }
  if (statusChanged) {
    const severity: IssueSeverity = result.status === "critical" || result.status === "offline" ? "critical" : result.status === "warning" ? "warning" : "info";
    await insertEvent(admin, deviceId, prevStatus, result.status, "status_change", severity, `สถานะเปลี่ยนจาก ${prevStatus} เป็น ${result.status}`, { issues: result.issues });
    return;
  }
  if (issuesChanged) {
    const resolved = [...prevIssueTypes].filter((k) => !newIssueTypes.has(k));
    const added = [...newIssueTypes].filter((k) => !prevIssueTypes.has(k));
    await insertEvent(
      admin,
      deviceId,
      prevStatus,
      result.status,
      added.length > 0 ? "issue_detected" : "issue_resolved",
      added.length > 0 ? "warning" : "info",
      added.length > 0 ? "พบปัญหาใหม่" : "ปัญหาบางส่วนได้รับการแก้ไข",
      { added, resolved }
    );
  }
}

async function insertEvent(
  admin: SupabaseClient,
  deviceId: string,
  previousStatus: string | null,
  newStatus: string,
  eventType: string,
  severity: IssueSeverity,
  message: string,
  details: Record<string, unknown> = {}
) {
  await admin.from("device_health_events").insert({
    device_id: deviceId,
    previous_status: previousStatus,
    new_status: newStatus,
    event_type: eventType,
    severity,
    message,
    details,
  });
}

/**
 * Scheduled sweep — evaluates every active (non-archived) device.
 * Only path that can detect a device going offline purely from time
 * passing (no telemetry event triggers that on its own).
 */
export async function sweepDeviceHealth(admin: SupabaseClient): Promise<{ evaluated: number; errors: number }> {
  const { data: devices } = await admin
    .from("iot_nodes")
    .select("id")
    .is("archived_at", null)
    .eq("is_disabled", false);

  let evaluated = 0;
  let errors = 0;
  for (const d of devices ?? []) {
    try {
      await applyDeviceHealth(admin, d.id as string);
      evaluated++;
    } catch (e) {
      errors++;
      console.warn("[device-health.sweep] row error", d.id, (e as Error).message);
    }
  }
  return { evaluated, errors };
}
