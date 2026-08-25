"use server";

import { createClient } from "@/lib/supabase/server";
import { getUserPlan } from "@/lib/plan-limits";

const PERIOD_HOURS: Record<string, number> = {
  "1h": 1,
  "6h": 6,
  "24h": 24,
  "7d": 24 * 7,
};

export type HistoryPoint = { t: string; v: number };

async function requireOwnedSensor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  deviceId: string,
  sensorId: string
): Promise<void> {
  const { data } = await supabase
    .from("sensors")
    .select("id, device_id, iot_nodes!inner(farm_id, farms!inner(user_id))")
    .eq("id", sensorId)
    .eq("device_id", deviceId)
    .maybeSingle();
  const node = (
    data as unknown as {
      iot_nodes: { farms: { user_id: string } | { user_id: string }[] } | { farms: { user_id: string } | { user_id: string }[] }[];
    } | null
  )?.iot_nodes;
  const nodeObj = Array.isArray(node) ? node[0] : node;
  const farmRel = nodeObj?.farms;
  const ownerId = Array.isArray(farmRel) ? farmRel[0]?.user_id : farmRel?.user_id;
  if (!data || ownerId !== userId) throw new Error("ไม่พบ Sensor หรือคุณไม่มีสิทธิ์เข้าถึง");
}

/** Chart data for a period. Always filters by sensor_id (indexed via
 * sensor_readings_sensor_occurred_idx) + a time range — never a full
 * table scan. */
export async function getSensorHistoryPoints(
  deviceId: string,
  sensorId: string,
  period: "1h" | "6h" | "24h" | "7d"
): Promise<HistoryPoint[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  await requireOwnedSensor(supabase, user.id, deviceId, sensorId);

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

export type HistorySummary = {
  recordCount: number;
  retentionDays: number | null;
  planName: string;
  recordHistory: boolean;
  intervalMinutes: number;
};

export async function getSensorHistorySummary(
  deviceId: string,
  sensorId: string
): Promise<HistorySummary | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  await requireOwnedSensor(supabase, user.id, deviceId, sensorId);

  const [{ count }, plan, { data: sensorRow }] = await Promise.all([
    supabase
      .from("sensor_readings")
      .select("id", { count: "exact", head: true })
      .eq("sensor_id", sensorId),
    getUserPlan(supabase, user.id),
    supabase
      .from("sensors")
      .select("record_history, history_interval_minutes")
      .eq("id", sensorId)
      .maybeSingle(),
  ]);

  return {
    recordCount: count ?? 0,
    retentionDays: plan.limits.sensor_history_days,
    planName: plan.name,
    recordHistory: !!sensorRow?.record_history,
    intervalMinutes: (sensorRow?.history_interval_minutes as number) ?? 5,
  };
}
