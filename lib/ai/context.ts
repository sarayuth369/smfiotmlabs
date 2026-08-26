/**
 * Phase 6.14 — aggregation layer between raw sensor_readings and the AI
 * provider. NEVER pass raw rows to a model — only compact aggregates
 * (min/max/avg/current/trend/sample_count), mirroring the exact query
 * shape already used by app/dashboard/farms/[farmId]/reports/actions.ts
 * (sensor_id, value, occurred_at — ordered, capped, retention-clamped).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeDeviceStatus } from "@/lib/device-status";

const AI_CONTEXT_HARD_CAP_DAYS = 14; // independent of plan retention — keeps every AI call cheap
const MAX_ROWS_PER_SENSOR = 500;

export type Trend = "up" | "down" | "flat" | "insufficient_data";

export type SensorAggregate = {
  sensor_id: string;
  name: string;
  sensor_type: string;
  unit: string | null;
  current: number | null;
  min: number | null;
  max: number | null;
  avg: number | null;
  trend: Trend;
  sample_count: number;
};

export type DeviceAiContext = {
  device_id: string;
  device_name: string;
  device_uid: string;
  status: string;
  last_seen: string | null;
  period_days: number;
  sensors: SensorAggregate[];
};

function computeTrend(values: { v: number; t: number }[]): Trend {
  if (values.length < 4) return "insufficient_data";
  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);
  const avg = (xs: { v: number }[]) => xs.reduce((s, x) => s + x.v, 0) / xs.length;
  const a = avg(firstHalf);
  const b = avg(secondHalf);
  const range = Math.max(...values.map((x) => x.v)) - Math.min(...values.map((x) => x.v)) || 1;
  const delta = (b - a) / range;
  if (delta > 0.08) return "up";
  if (delta < -0.08) return "down";
  return "flat";
}

/** Effective AI context window — capped independent of plan retention (spec §9), never wider than what the plan is even allowed to keep. */
export function resolveAiPeriodDays(requestedDays: number, retentionDays: number | null): number {
  const cap = retentionDays === null ? AI_CONTEXT_HARD_CAP_DAYS : Math.min(retentionDays, AI_CONTEXT_HARD_CAP_DAYS);
  return Math.min(Math.max(1, requestedDays), cap);
}

async function requireOwnedDeviceForAi(
  supabase: SupabaseClient,
  userId: string,
  deviceId: string
): Promise<{ id: string; device_uid: string; device_name: string; status: string; last_seen: string | null }> {
  const { data } = await supabase
    .from("iot_nodes")
    .select("id, device_uid, device_name, status, last_seen, farms!inner(user_id)")
    .eq("id", deviceId)
    .is("archived_at", null)
    .maybeSingle();
  const farmRel = (data as unknown as { farms: { user_id: string } | { user_id: string }[] } | null)?.farms;
  const ownerId = Array.isArray(farmRel) ? farmRel[0]?.user_id : farmRel?.user_id;
  if (!data || ownerId !== userId) throw new Error("ไม่พบอุปกรณ์ หรือคุณไม่มีสิทธิ์เข้าถึง");
  return {
    id: data.id as string,
    device_uid: data.device_uid as string,
    device_name: data.device_name as string,
    status: data.status as string,
    last_seen: data.last_seen as string | null,
  };
}

export async function getDeviceAiContext(
  supabase: SupabaseClient,
  userId: string,
  deviceId: string,
  requestedDays: number,
  retentionDays: number | null
): Promise<DeviceAiContext> {
  const device = await requireOwnedDeviceForAi(supabase, userId, deviceId);
  const periodDays = resolveAiPeriodDays(requestedDays, retentionDays);
  const since = new Date(Date.now() - periodDays * 86_400_000).toISOString();

  const { data: sensorRows } = await supabase
    .from("sensors")
    .select("id, name, sensor_type, unit")
    .eq("device_id", deviceId)
    .eq("status", "active")
    .is("archived_at", null);
  const sensors = sensorRows ?? [];

  const aggregates = await Promise.all(
    sensors.map(async (s): Promise<SensorAggregate> => {
      const { data: rows } = await supabase
        .from("sensor_readings")
        .select("value, occurred_at")
        .eq("sensor_id", s.id as string)
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: true })
        .limit(MAX_ROWS_PER_SENSOR);

      const values = (rows ?? []).map((r) => ({ v: Number(r.value), t: new Date(r.occurred_at as string).getTime() }));
      if (values.length === 0) {
        return {
          sensor_id: s.id as string,
          name: s.name as string,
          sensor_type: s.sensor_type as string,
          unit: s.unit as string | null,
          current: null,
          min: null,
          max: null,
          avg: null,
          trend: "insufficient_data",
          sample_count: 0,
        };
      }

      const nums = values.map((v) => v.v);
      return {
        sensor_id: s.id as string,
        name: s.name as string,
        sensor_type: s.sensor_type as string,
        unit: s.unit as string | null,
        current: values[values.length - 1].v,
        min: Math.min(...nums),
        max: Math.max(...nums),
        avg: nums.reduce((a, b) => a + b, 0) / nums.length,
        trend: computeTrend(values),
        sample_count: values.length,
      };
    })
  );

  return {
    device_id: device.id,
    device_name: device.device_name,
    device_uid: device.device_uid,
    status: computeDeviceStatus(device.status, device.last_seen),
    last_seen: device.last_seen,
    period_days: periodDays,
    sensors: aggregates,
  };
}

/** Business/Premium "all devices" — same aggregation, just looped across a farm's active devices. */
export async function getFarmAiContext(
  supabase: SupabaseClient,
  userId: string,
  farmId: string,
  requestedDays: number,
  retentionDays: number | null
): Promise<DeviceAiContext[]> {
  const { data: farm } = await supabase.from("farms").select("id").eq("id", farmId).eq("user_id", userId).maybeSingle();
  if (!farm) throw new Error("ไม่พบฟาร์ม หรือคุณไม่มีสิทธิ์เข้าถึง");

  const { data: deviceRows } = await supabase.from("iot_nodes").select("id").eq("farm_id", farmId).is("archived_at", null);
  const deviceIds = (deviceRows ?? []).map((d) => d.id as string);

  return Promise.all(deviceIds.map((id) => getDeviceAiContext(supabase, userId, id, requestedDays, retentionDays)));
}
