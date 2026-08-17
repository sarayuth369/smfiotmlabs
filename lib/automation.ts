/**
 * Automation rule evaluator. Pure functions — no DB access.
 * Called by rule engine (in /api/telemetry/ingest) after each reading batch.
 *
 * Conflict priority (highest wins): safety > manual > automation > schedule.
 * Manual override recorded via device_commands.metadata.manual_override.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildMqttTopic, publishMqtt } from "@/lib/mqtt";
import { randomUUID } from "crypto";

export type SensorTriggerConfig = {
  sensor_type: string;
  channel?: string | null;
  operator: ">" | ">=" | "<" | "<=" | "==" | "!=";
  value: number;
};

export type CommandActionConfig = {
  command: string;
  payload?: Record<string, unknown>;
  auto_off_seconds?: number;
};

export type NotificationActionConfig = {
  message: string;
  level?: "info" | "warning" | "error";
};

type Rule = {
  id: string;
  user_id: string;
  device_id: string | null;
  sensor_id: string | null;
  enabled: boolean;
  trigger_type: "sensor_value" | "schedule" | "device_status";
  trigger_config: SensorTriggerConfig | Record<string, unknown>;
  action_type: "command" | "notification" | "both";
  action_config: CommandActionConfig & NotificationActionConfig;
  cooldown_seconds: number;
  last_triggered_at: string | null;
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

/** Compare a numeric reading against operator + threshold. */
export function evaluateSensorCondition(value: number, cfg: SensorTriggerConfig): boolean {
  switch (cfg.operator) {
    case ">": return value > cfg.value;
    case ">=": return value >= cfg.value;
    case "<": return value < cfg.value;
    case "<=": return value <= cfg.value;
    case "==": return value === cfg.value;
    case "!=": return value !== cfg.value;
    default: return false;
  }
}

/** Cooldown gate — true if enough time passed since last trigger. */
export function cooldownExpired(lastTriggeredAt: string | null, cooldownSeconds: number): boolean {
  if (!lastTriggeredAt) return true;
  const elapsed = Date.now() - new Date(lastTriggeredAt).getTime();
  return elapsed >= cooldownSeconds * 1000;
}

/**
 * Evaluate all sensor-triggered rules against a single reading and dispatch
 * matching actions. Logs to automation_logs regardless of outcome.
 *
 * Uses service_role client — caller MUST validate device ownership before
 * this runs (already done by /api/telemetry/ingest via HMAC + device lookup).
 */
export async function evaluateReadingAgainstRules(
  admin: SupabaseClient,
  reading: Reading
): Promise<{ evaluated: number; executed: number; skipped: number; failed: number }> {
  const stats = { evaluated: 0, executed: 0, skipped: 0, failed: 0 };

  const { data: rules } = await admin
    .from("automation_rules")
    .select("id, user_id, device_id, sensor_id, enabled, trigger_type, trigger_config, action_type, action_config, cooldown_seconds, last_triggered_at")
    .eq("sensor_id", reading.sensor_id)
    .eq("enabled", true)
    .eq("trigger_type", "sensor_value");

  const list = (rules ?? []) as Rule[];
  stats.evaluated = list.length;

  for (const rule of list) {
    const cfg = rule.trigger_config as SensorTriggerConfig;
    if (!cfg || typeof cfg.value !== "number") continue;

    // Match sensor_type + channel (redundant safety — should match via sensor_id)
    if (cfg.sensor_type !== reading.sensor_type) continue;
    if ((cfg.channel ?? null) !== reading.channel) continue;

    const matched = evaluateSensorCondition(reading.value, cfg);
    if (!matched) continue;

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

    // Execute action
    const action = rule.action_config;
    let commandId: string | null = null;
    let mqttOk = false;
    let mqttError: string | undefined;

    if ((rule.action_type === "command" || rule.action_type === "both") && rule.device_id && action.command) {
      commandId = randomUUID();
      // Insert command row (audit)
      await admin.from("device_commands").insert({
        id: commandId,
        device_id: rule.device_id,
        user_id: rule.user_id,
        command: action.command,
        payload: {
          ...(action.payload ?? {}),
          triggered_by: "automation",
          rule_id: rule.id,
          auto_off_seconds: action.auto_off_seconds,
        },
        status: "pending",
      });

      // Publish MQTT
      const topic = buildMqttTopic(reading.device_uid, "command");
      const pub = await publishMqtt(topic, {
        command_id: commandId,
        command: action.command,
        payload: action.payload ?? {},
        timestamp: new Date().toISOString(),
      });
      mqttOk = pub.ok;
      mqttError = pub.error;

      if (mqttOk) {
        await admin
          .from("device_commands")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", commandId);
      }
    }

    // Log + update cooldown timestamp
    await admin.from("automation_logs").insert({
      rule_id: rule.id,
      device_id: reading.device_id,
      sensor_id: reading.sensor_id,
      status: mqttOk || rule.action_type === "notification" ? "executed" : "failed",
      trigger_value: { value: reading.value, occurred_at: reading.occurred_at, operator: cfg.operator, threshold: cfg.value },
      action_result: { command_id: commandId, mqtt_ok: mqttOk, error: mqttError },
    });

    await admin
      .from("automation_rules")
      .update({ last_triggered_at: new Date().toISOString() })
      .eq("id", rule.id);

    if (mqttOk || rule.action_type === "notification") stats.executed++;
    else stats.failed++;
  }

  return stats;
}
