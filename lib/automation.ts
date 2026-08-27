/**
 * Automation rule evaluator. Called by the rule engine (in
 * /api/telemetry/ingest, for sensor-value triggers) and by the
 * /api/cron/automation-schedule route (for schedule triggers).
 *
 * Dispatches relay actions via the CURRENT device MQTT bridge
 * (lib/device-mqtt.ts -> VPS provisioning webhook -> EMQX), the same path
 * the dashboard's Controls tab and the v1 API use. Do NOT reintroduce
 * lib/mqtt.ts (publishMqtt/buildMqttTopic) here -- that talks to the
 * legacy HiveMQ broker from the pre-EMQX architecture and is rollback-only.
 *
 * Conflict priority (highest wins): safety > manual > automation > schedule.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { publishToDevice } from "@/lib/device-mqtt";
import { randomUUID } from "crypto";
import { dispatchWebhookEvent } from "@/lib/webhooks";
import { getUserPlan, hasFeature } from "@/lib/plan-limits";

export type ConditionOperator = ">" | ">=" | "<" | "<=" | "==" | "!=";

export type SensorCondition = {
  sensor_id: string;
  sensor_type: string;
  channel?: string | null;
  operator: ConditionOperator;
  value: number;
};

/** Primary condition uses the columns already on the row (sensor_id/trigger's own sensor_type+channel+operator+value);
 *  `extra` holds any additional AND/OR conditions against OTHER sensors (spec 4C — combined conditions). */
export type SensorTriggerConfig = {
  sensor_type: string;
  channel?: string | null;
  operator: ConditionOperator;
  value: number;
  logic?: "AND" | "OR";
  extra?: SensorCondition[];
};

export type ScheduleTriggerConfig = {
  hour: number; // 0-23, Asia/Bangkok wall-clock (fixed UTC+7, no DST)
  minute: number; // 0-59
  days: number[]; // 0=Sun .. 6=Sat
};

/** Relay action — matches exactly what lib/device-mqtt.ts's "relay_cmd" kind needs. */
export type CommandActionConfig = {
  channel: number;
  state: boolean;
};

export type NotificationActionConfig = {
  message: string;
  level?: "info" | "warning" | "error";
};

export type AutomationRule = {
  id: string;
  user_id: string;
  farm_id: string | null;
  device_id: string | null;
  sensor_id: string | null;
  name: string;
  enabled: boolean;
  trigger_type: "sensor_value" | "schedule" | "device_status";
  trigger_config: SensorTriggerConfig | ScheduleTriggerConfig | Record<string, unknown>;
  action_type: "command" | "notification" | "both";
  action_config: CommandActionConfig & Partial<NotificationActionConfig>;
  cooldown_seconds: number;
  last_triggered_at: string | null;
  next_run_at: string | null;
};

type Reading = {
  sensor_id: string;
  device_id: string;
  device_uid: string;
  sensor_type: string;
  channel: string | null;
  value: number;
  occurred_at: string;
};

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Compare a numeric reading against operator + threshold. */
export function evaluateSensorCondition(value: number, operator: ConditionOperator, threshold: number): boolean {
  switch (operator) {
    case ">": return value > threshold;
    case ">=": return value >= threshold;
    case "<": return value < threshold;
    case "<=": return value <= threshold;
    case "==": return value === threshold;
    case "!=": return value !== threshold;
    default: return false;
  }
}

/** Cooldown gate — true if enough time passed since last trigger (also doubles as anti-loop/debounce). */
export function cooldownExpired(lastTriggeredAt: string | null, cooldownSeconds: number): boolean {
  if (!lastTriggeredAt) return true;
  const elapsed = Date.now() - new Date(lastTriggeredAt).getTime();
  return elapsed >= cooldownSeconds * 1000;
}

/** Next occurrence (as a real UTC instant) of {hour,minute,days} in Asia/Bangkok wall-clock time, strictly after `from`. */
export function computeNextRunAt(cfg: ScheduleTriggerConfig, from: Date = new Date()): Date {
  const days = cfg.days.length > 0 ? cfg.days : [0, 1, 2, 3, 4, 5, 6];
  const bkkNow = new Date(from.getTime() + BANGKOK_OFFSET_MS);
  for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
    const candidate = new Date(bkkNow.getTime());
    candidate.setUTCDate(candidate.getUTCDate() + dayOffset);
    candidate.setUTCHours(cfg.hour, cfg.minute, 0, 0);
    if (candidate.getTime() <= bkkNow.getTime()) continue; // must be strictly in the future
    if (!days.includes(candidate.getUTCDay())) continue;
    return new Date(candidate.getTime() - BANGKOK_OFFSET_MS);
  }
  // Fallback (shouldn't happen with a valid days[]) — tomorrow same time.
  const fallback = new Date(bkkNow.getTime() + 86_400_000);
  fallback.setUTCHours(cfg.hour, cfg.minute, 0, 0);
  return new Date(fallback.getTime() - BANGKOK_OFFSET_MS);
}

/**
 * Re-checks entitlement at EXECUTION time, not just at create/update time — if an
 * account is downgraded after a rule was created (e.g. Business -> Starter), existing
 * rules must stop firing rather than keep running forever on the old plan's access.
 */
async function planAllowsAutomation(admin: SupabaseClient, userId: string): Promise<boolean> {
  const plan = await getUserPlan(admin, userId);
  return hasFeature(plan, "automation");
}

async function resolveCustomerUuid(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin.from("profiles").select("customer_identity_id").eq("id", userId).maybeSingle();
  return (data?.customer_identity_id as string | null) ?? null;
}

/** Execute a rule's action (relay command and/or notification), logging to automation_logs either way. */
async function executeRule(
  admin: SupabaseClient,
  rule: AutomationRule,
  deviceUid: string | null,
  triggerValue: Record<string, unknown>
): Promise<"executed" | "failed"> {
  let mqttOk = false;
  let mqttError: string | undefined;
  let commandId: string | null = null;

  if ((rule.action_type === "command" || rule.action_type === "both") && rule.device_id && deviceUid) {
    const action = rule.action_config;
    const customerUuid = await resolveCustomerUuid(admin, rule.user_id);
    if (!customerUuid) {
      mqttError = "account is not provisioned for MQTT";
    } else {
      commandId = randomUUID();
      await admin.from("device_commands").insert({
        id: commandId,
        device_id: rule.device_id,
        user_id: rule.user_id,
        command: "relay_set",
        payload: { channel: action.channel, state: action.state, triggered_by: "automation", rule_id: rule.id },
        status: "pending",
      });

      const pub = await publishToDevice(customerUuid, deviceUid, "relay_cmd", { state: action.state }, { channel: action.channel, retain: false });
      mqttOk = pub.ok;
      mqttError = pub.error;

      await admin
        .from("device_commands")
        .update({ status: mqttOk ? "sent" : "failed", sent_at: mqttOk ? new Date().toISOString() : null })
        .eq("id", commandId);
    }
  }

  // Notification action — reuses the existing (Business+) webhook dispatcher rather than
  // standing up a brand-new per-channel notification system for this first automation pass.
  if (rule.action_type === "notification" || rule.action_type === "both") {
    await dispatchWebhookEvent(admin, rule.user_id, "automation_triggered", {
      rule_id: rule.id,
      rule_name: rule.name,
      device_id: rule.device_id,
      message: rule.action_config.message ?? `Automation "${rule.name}" triggered`,
      ...triggerValue,
    });
  }

  const success = rule.action_type === "notification" ? true : mqttOk;

  await admin.from("automation_logs").insert({
    rule_id: rule.id,
    device_id: rule.device_id,
    sensor_id: rule.sensor_id,
    status: success ? "executed" : "failed",
    trigger_value: triggerValue,
    action_result: { command_id: commandId, mqtt_ok: mqttOk, error: mqttError },
  });

  await admin.from("automation_rules").update({ last_triggered_at: new Date().toISOString() }).eq("id", rule.id);

  return success ? "executed" : "failed";
}

/** Fetch the latest known value for a sensor (maintained table, single-row lookup — no history scan). */
async function latestSensorValue(admin: SupabaseClient, sensorId: string): Promise<number | null> {
  const { data } = await admin.from("sensor_readings_latest").select("value").eq("sensor_id", sensorId).maybeSingle();
  return data ? (data.value as number) : null;
}

/**
 * Evaluate all sensor-triggered rules against a single reading and dispatch matching
 * actions. Logs to automation_logs regardless of outcome. Scoped to rules whose PRIMARY
 * sensor_id matches this reading — never scans the whole automation_rules table.
 *
 * Uses service_role client — caller MUST validate device ownership before this runs
 * (already done by /api/telemetry/ingest via HMAC + device lookup).
 */
export async function evaluateReadingAgainstRules(
  admin: SupabaseClient,
  reading: Reading
): Promise<{ evaluated: number; executed: number; skipped: number; failed: number }> {
  const stats = { evaluated: 0, executed: 0, skipped: 0, failed: 0 };

  const { data: rules } = await admin
    .from("automation_rules")
    .select("id, user_id, farm_id, device_id, sensor_id, name, enabled, trigger_type, trigger_config, action_type, action_config, cooldown_seconds, last_triggered_at, next_run_at")
    .eq("sensor_id", reading.sensor_id)
    .eq("enabled", true)
    .eq("trigger_type", "sensor_value");

  const list = (rules ?? []) as AutomationRule[];
  stats.evaluated = list.length;

  for (const rule of list) {
    const cfg = rule.trigger_config as SensorTriggerConfig;
    if (!cfg || typeof cfg.value !== "number") continue;
    if (cfg.sensor_type !== reading.sensor_type) continue;
    if ((cfg.channel ?? null) !== reading.channel) continue;

    const primaryMatch = evaluateSensorCondition(reading.value, cfg.operator, cfg.value);

    let matched = primaryMatch;
    const extraResults: { sensor_id: string; matched: boolean; value: number | null }[] = [];
    if (cfg.extra && cfg.extra.length > 0) {
      for (const extra of cfg.extra) {
        const val = await latestSensorValue(admin, extra.sensor_id);
        const ok = val !== null && evaluateSensorCondition(val, extra.operator, extra.value);
        extraResults.push({ sensor_id: extra.sensor_id, matched: ok, value: val });
      }
      const logic = cfg.logic ?? "AND";
      matched = logic === "AND" ? primaryMatch && extraResults.every((r) => r.matched) : primaryMatch || extraResults.some((r) => r.matched);
    }

    if (!matched) continue;

    if (!(await planAllowsAutomation(admin, rule.user_id))) {
      await admin.from("automation_logs").insert({
        rule_id: rule.id,
        device_id: reading.device_id,
        sensor_id: reading.sensor_id,
        status: "skipped",
        skip_reason: "plan_restriction",
        trigger_value: { value: reading.value, occurred_at: reading.occurred_at },
      });
      stats.skipped++;
      continue;
    }

    if (!cooldownExpired(rule.last_triggered_at, rule.cooldown_seconds)) {
      await admin.from("automation_logs").insert({
        rule_id: rule.id,
        device_id: reading.device_id,
        sensor_id: reading.sensor_id,
        status: "skipped",
        skip_reason: "cooldown",
        trigger_value: { value: reading.value, occurred_at: reading.occurred_at },
      });
      stats.skipped++;
      continue;
    }

    const outcome = await executeRule(admin, rule, reading.device_uid, {
      value: reading.value,
      occurred_at: reading.occurred_at,
      operator: cfg.operator,
      threshold: cfg.value,
      extra: extraResults.length > 0 ? extraResults : undefined,
    });
    if (outcome === "executed") stats.executed++;
    else stats.failed++;
  }

  return stats;
}

/**
 * Cron entry point (/api/cron/automation-schedule) — fires schedule-type rules whose
 * next_run_at has arrived, then advances next_run_at to the next matching occurrence so
 * the same slot never re-fires. cooldown_seconds is kept as a backstop in case the cron
 * overlaps a previous run, but next_run_at is the primary anti-duplicate mechanism here.
 */
export async function evaluateScheduleRules(admin: SupabaseClient): Promise<{ evaluated: number; executed: number; failed: number }> {
  const stats = { evaluated: 0, executed: 0, failed: 0 };
  const nowIso = new Date().toISOString();

  const { data: rules } = await admin
    .from("automation_rules")
    .select("id, user_id, farm_id, device_id, sensor_id, name, enabled, trigger_type, trigger_config, action_type, action_config, cooldown_seconds, last_triggered_at, next_run_at")
    .eq("enabled", true)
    .eq("trigger_type", "schedule")
    .lte("next_run_at", nowIso)
    .not("next_run_at", "is", null);

  const list = (rules ?? []) as AutomationRule[];
  stats.evaluated = list.length;

  for (const rule of list) {
    const cfg = rule.trigger_config as ScheduleTriggerConfig;
    let deviceUid: string | null = null;
    if (rule.device_id) {
      const { data: node } = await admin.from("iot_nodes").select("device_uid").eq("id", rule.device_id).maybeSingle();
      deviceUid = (node?.device_uid as string | null) ?? null;
    }

    const allowed = await planAllowsAutomation(admin, rule.user_id);
    if (!allowed) {
      await admin.from("automation_logs").insert({
        rule_id: rule.id,
        device_id: rule.device_id,
        sensor_id: rule.sensor_id,
        status: "skipped",
        skip_reason: "plan_restriction",
        trigger_value: { scheduled_for: rule.next_run_at },
      });
    } else if (cooldownExpired(rule.last_triggered_at, rule.cooldown_seconds)) {
      const outcome = await executeRule(admin, rule, deviceUid, { scheduled_for: rule.next_run_at });
      if (outcome === "executed") stats.executed++;
      else stats.failed++;
    }

    const next = computeNextRunAt(cfg, new Date());
    await admin.from("automation_rules").update({ next_run_at: next.toISOString() }).eq("id", rule.id);
  }

  return stats;
}
