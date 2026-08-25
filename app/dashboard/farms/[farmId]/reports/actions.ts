"use server";

import { createClient } from "@/lib/supabase/server";
import { getUserPlan, hasFeature } from "@/lib/plan-limits";

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

// ============================================================
// Phase 6.9A — CSV export
// ============================================================
// Export runs entirely server-side (this "use server" action) so the
// authorized query — not a client-suppliable device UID or customer id —
// decides what rows come back. The client only ever gets a finished CSV
// string for a sensor it has already proven ownership of via the Reports
// page it's rendered from.

const TZ = "Asia/Bangkok";
// No plan currently needs more than 30 days in a single export file — this
// is a hard ceiling independent of retention, purely to keep exports small
// and fast (never load the full retention window into one CSV/response).
const EXPORT_HARD_CAP_DAYS = 30;
const EXPORT_ROW_CAP = 20000;

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso)
  );
}

function fmtDateTime(iso: string): string {
  const timePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  return `${fmtDate(iso)} ${timePart}`;
}

/** Strip newlines (never let free-text break CSV row structure) and trim. */
function cleanText(v: string | null | undefined): string {
  return (v ?? "").replace(/[\r\n]+/g, " ").trim();
}

/** RFC4180-style quoting — wraps in quotes only when the field needs it (delimiter is TAB, see below). */
function csvQuote(s: string): string {
  return /["\t\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Every metadata header line ("Farm: xxx") and every per-row column
 * (Report Date / Recorded At / Value) is either fixed literal text or a
 * server-controlled value (date, number) — none of them put raw
 * user-editable text at the START of a CSV field, so nothing here can be
 * interpreted as a spreadsheet formula. No injection-prefix guard needed.
 */
function csvPlain(v: string | number | null | undefined): string {
  return csvQuote(v === null || v === undefined ? "" : String(v));
}

function safeFilenamePart(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "sensor";
}

export type ExportPeriodInfo = {
  /** Max days a single export may cover — min(plan retention, hard cap). null retention (unlimited) still caps at the hard limit. */
  maxDays: number;
  /** Pre-validated day choices for the export period dropdown. */
  options: number[];
  retentionDays: number | null;
  planAllowsHistory: boolean;
};

export async function getExportPeriodOptions(farmId: string): Promise<ExportPeriodInfo> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { maxDays: 0, options: [], retentionDays: null, planAllowsHistory: false };
  await requireOwnedFarm(supabase, user.id, farmId);

  const plan = await getUserPlan(supabase, user.id);
  const planAllowsHistory = hasFeature(plan, "sensor_history");
  const retentionDays = plan.limits.sensor_history_days;
  const maxDays = retentionDays === null ? EXPORT_HARD_CAP_DAYS : Math.min(retentionDays, EXPORT_HARD_CAP_DAYS);

  const candidates = [1, 3, 7, 14, 30].filter((d) => d <= maxDays);
  const options = [...new Set([...candidates, maxDays])].sort((a, b) => a - b);

  return { maxDays, options, retentionDays, planAllowsHistory };
}

export type ExportResult = { ok: true; csv: string; filename: string } | { ok: false; error: string };

/**
 * Generates a CSV export of one sensor's history for the requesting user.
 * `days` is re-validated here against the user's PLAN, not trusted from the
 * caller — a Server Action's arguments are just POST body fields a client
 * could tamper with, so the UI only offering valid choices is not enough.
 */
export async function exportSensorHistoryCsv(farmId: string, sensorId: string, days: number): Promise<ExportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  await requireOwnedFarm(supabase, user.id, farmId);

  const plan = await getUserPlan(supabase, user.id);
  if (!hasFeature(plan, "sensor_history")) {
    return { ok: false, error: `แพ็กเกจ ${plan.name} ไม่รองรับ Sensor History` };
  }

  const retentionDays = plan.limits.sensor_history_days;
  const maxDays = retentionDays === null ? EXPORT_HARD_CAP_DAYS : Math.min(retentionDays, EXPORT_HARD_CAP_DAYS);
  const requestedDays = Math.floor(days);
  if (!Number.isFinite(requestedDays) || requestedDays < 1 || requestedDays > maxDays) {
    return { ok: false, error: `ช่วงเวลาสำหรับ export ต้องอยู่ระหว่าง 1-${maxDays} วัน ตามสิทธิ์แพ็กเกจ ${plan.name}` };
  }

  // Ownership chain resolved in one query: sensor -> device -> farm (must
  // equal farmId AND belong to this user) -> zone. Nothing here is trusted
  // from the client except the ids, and every id is checked against auth.uid().
  const { data } = await supabase
    .from("sensors")
    .select(
      "id, name, sensor_type, unit, iot_nodes!inner(id, device_name, device_uid, farm_id, farms!inner(id, name, user_id), zones(name))"
    )
    .eq("id", sensorId)
    .eq("iot_nodes.farm_id", farmId)
    .maybeSingle();

  type SensorRow = {
    id: string;
    name: string;
    sensor_type: string;
    unit: string | null;
    iot_nodes:
      | {
          id: string;
          device_name: string;
          device_uid: string;
          farm_id: string;
          farms: { id: string; name: string; user_id: string } | { id: string; name: string; user_id: string }[];
          zones: { name: string } | { name: string }[] | null;
        }
      | Array<{
          id: string;
          device_name: string;
          device_uid: string;
          farm_id: string;
          farms: { id: string; name: string; user_id: string } | { id: string; name: string; user_id: string }[];
          zones: { name: string } | { name: string }[] | null;
        }>;
  };
  const raw = data as unknown as SensorRow | null;
  const node = raw ? (Array.isArray(raw.iot_nodes) ? raw.iot_nodes[0] : raw.iot_nodes) : null;
  const farm = node ? (Array.isArray(node.farms) ? node.farms[0] : node.farms) : null;
  const zone = node ? (Array.isArray(node.zones) ? node.zones[0] : node.zones) : null;

  if (!raw || !node || !farm || farm.user_id !== user.id) {
    return { ok: false, error: "ไม่พบ Sensor หรือคุณไม่มีสิทธิ์เข้าถึง" };
  }

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const customerName = (profile?.full_name as string | null) || user.email || "-";

  const nowMs = Date.now();
  const sinceIso = new Date(nowMs - requestedDays * 86_400_000).toISOString();
  const nowIso = new Date(nowMs).toISOString();

  const { data: readings } = await supabase
    .from("sensor_readings")
    .select("value, occurred_at")
    .eq("sensor_id", sensorId)
    .gte("occurred_at", sinceIso)
    .order("occurred_at", { ascending: true })
    .limit(EXPORT_ROW_CAP);

  const rows = readings ?? [];

  const lines: string[] = [];
  lines.push(csvPlain(`Report Generated At: ${fmtDateTime(nowIso)}`));
  lines.push(csvPlain(`Report Period: ${fmtDateTime(sinceIso)} to ${fmtDateTime(nowIso)}`));
  lines.push(csvPlain(`Timezone: ${TZ}`));
  lines.push(csvPlain(`Customer: ${cleanText(customerName)}`));
  lines.push(csvPlain(`Farm: ${cleanText(farm.name)}`));
  if (zone?.name) lines.push(csvPlain(`Zone: ${cleanText(zone.name)}`));
  lines.push(csvPlain(`Node Name: ${cleanText(node.device_name)}`));
  lines.push(csvPlain(`Device UID: ${node.device_uid}`));
  lines.push(csvPlain(`Sensor: ${cleanText(raw.name)}${raw.unit ? ` (${cleanText(raw.unit)})` : ""}`));
  lines.push(csvPlain(`Sensor Type: ${raw.sensor_type}`));
  lines.push(""); // blank separator row before the data table

  // Per-row columns intentionally kept minimal — customer/farm/zone/node/
  // sensor/type/unit are already stated once in the metadata block above,
  // so repeating them on every row is pure noise.
  //
  // TAB-delimited, not comma: when Excel opens a Unicode text file directly
  // (which is how the UTF-16LE download below gets opened), it splits
  // columns using the Windows "list separator" regional setting, not a
  // literal comma — on many locales that isn't a comma, so a comma-joined
  // file lands entirely in column A. Tab is what Excel's plain-text-open
  // path always splits on regardless of region.
  lines.push(["Report Date", "Recorded At", "Value"].join("\t"));

  for (const r of rows) {
    const occurredAt = r.occurred_at as string;
    lines.push([csvPlain(fmtDate(occurredAt)), csvPlain(fmtDateTime(occurredAt)), csvPlain(Number(r.value))].join("\t"));
  }

  // Plain UTF-8 text, no BOM here — non-Microsoft-365 Excel builds ignore a
  // UTF-8 BOM specifically for .csv (unlike .txt) and fall back to the
  // system ANSI codepage, mangling Thai text. The client encodes this as
  // UTF-16LE with a BOM instead, which every Excel version has always
  // auto-detected correctly regardless of file extension.
  const csv = lines.join("\r\n");
  const filename = `SMF_Report_${safeFilenamePart(node.device_uid)}_${safeFilenamePart(raw.name)}_${fmtDate(nowIso)}.csv`;

  return { ok: true, csv, filename };
}
