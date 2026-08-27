"use server";

/**
 * Server-side Automation engine CRUD — sensor-condition (with optional
 * AND/OR second condition) + schedule triggers, on top of the existing
 * automation_rules/automation_logs tables and lib/automation.ts evaluator.
 * Distinct from ./actions.ts (the existing on-device Schedule/Rules panel,
 * which keeps working unchanged) — this adds the parts that only a
 * server-side engine can do: combined AND/OR conditions and an execution log.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canCreateAutomation, hasFeature, getUserPlan } from "@/lib/plan-limits";
import { computeNextRunAt, type ConditionOperator } from "@/lib/automation";

type SupaClient = Awaited<ReturnType<typeof createClient>>;

export type AutomationInput = {
  name: string;
  device_id: string;
  trigger_type: "sensor_value" | "schedule";
  sensor_id?: string;
  operator?: ConditionOperator;
  value?: number;
  extra_sensor_id?: string;
  extra_operator?: ConditionOperator;
  extra_value?: number;
  logic?: "AND" | "OR";
  hour?: number;
  minute?: number;
  days?: number[];
  channel: number;
  state: boolean;
  notify: boolean;
  notify_message?: string;
  cooldown_seconds: number;
};

export type AutomationRow = {
  id: string;
  name: string;
  enabled: boolean;
  trigger_type: "sensor_value" | "schedule" | "device_status";
  trigger_config: Record<string, unknown>;
  action_type: "command" | "notification" | "both";
  action_config: Record<string, unknown>;
  cooldown_seconds: number;
  last_triggered_at: string | null;
  next_run_at: string | null;
  device_id: string | null;
  sensor_id: string | null;
};

export type ActivityRow = {
  id: string;
  rule_id: string;
  status: "triggered" | "executed" | "skipped" | "failed";
  skip_reason: string | null;
  trigger_value: Record<string, unknown> | null;
  action_result: Record<string, unknown> | null;
  executed_at: string;
};

async function requireUser(supabase: SupaClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthenticated");
  return user;
}

async function requireFarmOwnership(supabase: SupaClient, userId: string, farmId: string): Promise<void> {
  const { data } = await supabase.from("farms").select("id").eq("id", farmId).eq("user_id", userId).maybeSingle();
  if (!data) throw new Error("ไม่พบฟาร์ม หรือคุณไม่มีสิทธิ์เข้าถึง");
}

/** device belongs to this farm (implicitly this user, since requireFarmOwnership already checked). */
async function requireDeviceInFarm(supabase: SupaClient, farmId: string, deviceId: string): Promise<void> {
  const { data } = await supabase.from("iot_nodes").select("id").eq("id", deviceId).eq("farm_id", farmId).is("archived_at", null).maybeSingle();
  if (!data) throw new Error("ไม่พบอุปกรณ์ในฟาร์มนี้");
}

async function requireChannelExists(supabase: SupaClient, deviceId: string, channel: number): Promise<void> {
  const { data } = await supabase.from("relays").select("channel").eq("device_id", deviceId).eq("channel", channel).is("archived_at", null).maybeSingle();
  if (!data) throw new Error(`ไม่พบ Channel ${channel} บนอุปกรณ์นี้`);
}

/** Sensor must belong to a device inside this farm (not necessarily the same device the action controls). */
async function requireSensorInFarm(supabase: SupaClient, farmId: string, sensorId: string): Promise<{ sensor_type: string; channel: string | null; device_id: string }> {
  const { data } = await supabase
    .from("sensors")
    .select("sensor_type, channel, device_id, iot_nodes!inner(farm_id)")
    .eq("id", sensorId)
    .is("archived_at", null)
    .maybeSingle();
  const nodeRel = (data as unknown as { iot_nodes: { farm_id: string } | { farm_id: string }[] } | null)?.iot_nodes;
  const nodeFarmId = Array.isArray(nodeRel) ? nodeRel[0]?.farm_id : nodeRel?.farm_id;
  if (!data || nodeFarmId !== farmId) throw new Error("ไม่พบ Sensor ในฟาร์มนี้");
  return { sensor_type: data.sensor_type as string, channel: (data.channel as string | null) ?? null, device_id: data.device_id as string };
}

function buildTriggerConfig(input: AutomationInput, primarySensor: { sensor_type: string; channel: string | null }) {
  if (input.trigger_type === "schedule") {
    const days = Array.isArray(input.days) ? input.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [];
    const hour = Number(input.hour);
    const minute = Number(input.minute);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error("ชั่วโมงไม่ถูกต้อง");
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error("นาทีไม่ถูกต้อง");
    if (days.length === 0) throw new Error("กรุณาเลือกอย่างน้อย 1 วัน");
    return { hour, minute, days };
  }

  if (!input.operator || typeof input.value !== "number" || isNaN(input.value)) throw new Error("กรุณากำหนดเงื่อนไข Sensor ให้ครบ");
  const cfg: Record<string, unknown> = {
    sensor_type: primarySensor.sensor_type,
    channel: primarySensor.channel,
    operator: input.operator,
    value: input.value,
  };
  if (input.extra_sensor_id && input.extra_operator && typeof input.extra_value === "number" && !isNaN(input.extra_value)) {
    cfg.logic = input.logic === "OR" ? "OR" : "AND";
    cfg.extra = [{ sensor_id: input.extra_sensor_id, sensor_type: "", operator: input.extra_operator, value: input.extra_value }];
  }
  return cfg;
}

export async function listAutomations(farmId: string): Promise<{ rows: AutomationRow[]; activity: ActivityRow[]; quota: { used: number; limit: number | null }; allowed: boolean; planName: string }> {
  const supabase = await createClient();
  const user = await requireUser(supabase);
  await requireFarmOwnership(supabase, user.id, farmId);

  const plan = await getUserPlan(supabase, user.id);
  const allowed = hasFeature(plan, "automation");

  const { data } = await supabase
    .from("automation_rules")
    .select("id, name, enabled, trigger_type, trigger_config, action_type, action_config, cooldown_seconds, last_triggered_at, next_run_at, device_id, sensor_id")
    .eq("farm_id", farmId)
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as AutomationRow[];

  const ruleIds = rows.map((r) => r.id);
  let activity: ActivityRow[] = [];
  if (ruleIds.length > 0) {
    const { data: logs } = await supabase
      .from("automation_logs")
      .select("id, rule_id, status, skip_reason, trigger_value, action_result, executed_at")
      .in("rule_id", ruleIds)
      .order("executed_at", { ascending: false })
      .limit(15);
    activity = (logs ?? []) as ActivityRow[];
  }

  return {
    rows,
    activity,
    quota: { used: rows.length, limit: plan.limits.max_automation_rules },
    allowed,
    planName: plan.name,
  };
}

export async function createAutomation(farmId: string, input: AutomationInput): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await requireUser(supabase);
    await requireFarmOwnership(supabase, user.id, farmId);

    const quota = await canCreateAutomation(supabase, user.id);
    if (!quota.ok) throw new Error(quota.reason ?? "ไม่สามารถสร้าง Automation ได้");

    if (!input.name?.trim()) throw new Error("กรุณากรอกชื่อ Automation");
    await requireDeviceInFarm(supabase, farmId, input.device_id);
    await requireChannelExists(supabase, input.device_id, input.channel);

    let sensorId: string | null = null;
    let primarySensor = { sensor_type: "", channel: null as string | null };
    if (input.trigger_type === "sensor_value") {
      if (!input.sensor_id) throw new Error("กรุณาเลือก Sensor");
      primarySensor = await requireSensorInFarm(supabase, farmId, input.sensor_id);
      sensorId = input.sensor_id;
      if (input.extra_sensor_id) await requireSensorInFarm(supabase, farmId, input.extra_sensor_id);
    }

    const trigger_config = buildTriggerConfig(input, primarySensor);
    const action_type: "command" | "notification" | "both" = input.notify ? "both" : "command";
    const action_config = { channel: input.channel, state: input.state, message: input.notify_message || `Automation "${input.name}" triggered` };
    const cooldown_seconds = Number.isFinite(input.cooldown_seconds) && input.cooldown_seconds >= 0 ? Math.floor(input.cooldown_seconds) : 60;
    const next_run_at = input.trigger_type === "schedule" ? computeNextRunAt(trigger_config as { hour: number; minute: number; days: number[] }).toISOString() : null;

    const { error } = await supabase.from("automation_rules").insert({
      user_id: user.id,
      farm_id: farmId,
      device_id: input.device_id,
      sensor_id: sensorId,
      name: input.name.trim(),
      enabled: true,
      trigger_type: input.trigger_type,
      trigger_config,
      action_type,
      action_config,
      cooldown_seconds,
      next_run_at,
    });
    if (error) throw new Error(error.message);

    revalidatePath(`/dashboard/farms/${farmId}/automation`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
  }
}

export async function toggleAutomation(farmId: string, id: string, enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await requireUser(supabase);
    await requireFarmOwnership(supabase, user.id, farmId);
    const { error } = await supabase.from("automation_rules").update({ enabled }).eq("id", id).eq("user_id", user.id).eq("farm_id", farmId);
    if (error) throw new Error(error.message);
    revalidatePath(`/dashboard/farms/${farmId}/automation`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
  }
}

export async function deleteAutomation(farmId: string, id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await requireUser(supabase);
    await requireFarmOwnership(supabase, user.id, farmId);
    const { error } = await supabase.from("automation_rules").delete().eq("id", id).eq("user_id", user.id).eq("farm_id", farmId);
    if (error) throw new Error(error.message);
    revalidatePath(`/dashboard/farms/${farmId}/automation`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
  }
}
