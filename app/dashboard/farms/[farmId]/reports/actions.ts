"use server";

import { createClient } from "@/lib/supabase/server";

async function requireOwnedFarm(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  farmId: string
): Promise<void> {
  const { data } = await supabase
    .from("farms")
    .select("id")
    .eq("id", farmId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("ไม่พบฟาร์ม หรือคุณไม่มีสิทธิ์เข้าถึง");
}

/** Confirms sensorId belongs to a device in farmId — used by every report query below. */
async function requireSensorInFarm(
  supabase: Awaited<ReturnType<typeof createClient>>,
  farmId: string,
  sensorId: string
): Promise<{ unit: string | null; name: string } | null> {
  const { data } = await supabase
    .from("sensors")
    .select("id, name, unit, device_id, iot_nodes!inner(farm_id)")
    .eq("id", sensorId)
    .eq("iot_nodes.farm_id", farmId)
    .maybeSingle();
  if (!data) return null;
  return { unit: (data as { unit: string | null }).unit, name: (data as { name: string }).name };
}

const PERIOD_HOURS: Record<string, number> = { "1h": 1, "6h": 6, "24h": 24, "7d": 24 * 7 };

export type ReportSensorOption = { id: string; name: string; unit: string | null; deviceName: string };

export async function getReportSensorOptions(farmId: string): Promise<ReportSensorOption[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  await requireOwnedFarm(supabase, user.id, farmId);

  const { data: devices } = await supabase
    .from("iot_nodes")
    .select("id, device_name")
    .eq("farm_id", farmId)
    .is("archived_at", null);
  const deviceIds = (devices ?? []).map((d) => d.id as string);
  const deviceNameById = new Map((devices ?? []).map((d) => [d.id as string, d.device_name as string]));
  if (deviceIds.length === 0) return [];

  const { data: sensors } = await supabase
    .from("sensors")
    .select("id, name, unit, device_id")
    .in("device_id", deviceIds)
    .is("archived_at", null)
    .order("name");

  return (sensors ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    unit: s.unit as string | null,
    deviceName: deviceNameById.get(s.device_id as string) ?? "",
  }));
}

export type ReportOverview = {
  deviceCount: number;
  onlineCount: number;
  offlineCount: number;
  sensorsRecording: number;
  sensorsTotal: number;
  lastRecordedAt: string | null;
};

export async function getReportOverview(farmId: string): Promise<ReportOverview> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthenticated");
  await requireOwnedFarm(supabase, user.id, farmId);

  const { data: devices } = await supabase
    .from("iot_nodes")
    .select("id, last_seen")
    .eq("farm_id", farmId)
    .is("archived_at", null);
  const deviceIds = (devices ?? []).map((d) => d.id as string);

  const nowMs = Date.now();
  let onlineCount = 0;
  for (const d of devices ?? []) {
    const lastSeen = d.last_seen as string | null;
    if (lastSeen && (nowMs - new Date(lastSeen).getTime()) / 1000 <= 60) onlineCount++;
  }

  if (deviceIds.length === 0) {
    return { deviceCount: 0, onlineCount: 0, offlineCount: 0, sensorsRecording: 0, sensorsTotal: 0, lastRecordedAt: null };
  }

  const [{ count: sensorsTotal }, { count: sensorsRecording }, { data: latestRows }] = await Promise.all([
    supabase
      .from("sensors")
      .select("id", { count: "exact", head: true })
      .in("device_id", deviceIds)
      .is("archived_at", null),
    supabase
      .from("sensors")
      .select("id", { count: "exact", head: true })
      .in("device_id", deviceIds)
      .is("archived_at", null)
      .eq("record_history", true),
    supabase
      .from("sensor_readings_latest")
      .select("received_at")
      .in("device_id", deviceIds)
      .order("received_at", { ascending: false })
      .limit(1),
  ]);

  return {
    deviceCount: deviceIds.length,
    onlineCount,
    offlineCount: deviceIds.length - onlineCount,
    sensorsRecording: sensorsRecording ?? 0,
    sensorsTotal: sensorsTotal ?? 0,
    lastRecordedAt: (latestRows?.[0]?.received_at as string | null) ?? null,
  };
}

export type SensorSummary = {
  current: number | null;
  min: number | null;
  max: number | null;
  avg: number | null;
  samples: number;
  unit: string | null;
  sensorName: string;
};

export async function getSensorSummary(
  farmId: string,
  sensorId: string,
  period: "1h" | "6h" | "24h" | "7d"
): Promise<SensorSummary | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  await requireOwnedFarm(supabase, user.id, farmId);
  const sensor = await requireSensorInFarm(supabase, farmId, sensorId);
  if (!sensor) return null;

  const hours = PERIOD_HOURS[period] ?? 24;
  const since = new Date(Date.now() - hours * 3600_000).toISOString();

  const { data } = await supabase
    .from("sensor_readings")
    .select("value, occurred_at")
    .eq("sensor_id", sensorId)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: true })
    .limit(2000);

  const values = (data ?? []).map((r) => Number(r.value));
  if (values.length === 0) {
    return { current: null, min: null, max: null, avg: null, samples: 0, unit: sensor.unit, sensorName: sensor.name };
  }
  return {
    current: values[values.length - 1],
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((s, v) => s + v, 0) / values.length,
    samples: values.length,
    unit: sensor.unit,
    sensorName: sensor.name,
  };
}

export type TrendPoint = { t: string; v: number };

export async function getSensorTrend(
  farmId: string,
  sensorId: string,
  period: "1h" | "6h" | "24h" | "7d"
): Promise<TrendPoint[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  await requireOwnedFarm(supabase, user.id, farmId);
  const sensor = await requireSensorInFarm(supabase, farmId, sensorId);
  if (!sensor) return [];

  const hours = PERIOD_HOURS[period] ?? 24;
  const since = new Date(Date.now() - hours * 3600_000).toISOString();

  const { data } = await supabase
    .from("sensor_readings")
    .select("value, occurred_at")
    .eq("sensor_id", sensorId)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: true })
    .limit(2000);

  return (data ?? []).map((r) => ({ t: r.occurred_at as string, v: Number(r.value) }));
}

export type DailyBar = { label: string; avg: number; min: number; max: number };

export async function getDailySummary(farmId: string, sensorId: string): Promise<DailyBar[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  await requireOwnedFarm(supabase, user.id, farmId);
  const sensor = await requireSensorInFarm(supabase, farmId, sensorId);
  if (!sensor) return [];

  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data } = await supabase
    .from("sensor_readings")
    .select("value, occurred_at")
    .eq("sensor_id", sensorId)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: true })
    .limit(3000);

  const byDay = new Map<string, number[]>();
  for (const r of data ?? []) {
    const day = (r.occurred_at as string).slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push(Number(r.value));
    byDay.set(day, list);
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, values]) => ({
      label: day.slice(5), // MM-DD
      avg: values.reduce((s, v) => s + v, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
    }));
}
