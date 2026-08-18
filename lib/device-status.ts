/**
 * Derive effective device status from last_seen timestamp.
 * ESP32 status='online' in DB is stale — bridge only writes on ingest,
 * never on disconnect. Compute freshness at read time instead.
 *
 * ESP32 firmware sends status heartbeat every 10s. Threshold = 60s = 6x margin.
 */

export const DEVICE_OFFLINE_THRESHOLD_SEC = 60;

export type EffectiveStatus = "online" | "offline" | "warning" | "never_connected";

export function computeDeviceStatus(
  dbStatus: string | null | undefined,
  lastSeen: string | null | undefined
): EffectiveStatus {
  if (!lastSeen) return "never_connected";

  const lastSeenMs = new Date(lastSeen).getTime();
  if (!Number.isFinite(lastSeenMs)) return "never_connected";

  const ageSec = (Date.now() - lastSeenMs) / 1000;
  if (ageSec > DEVICE_OFFLINE_THRESHOLD_SEC) return "offline";

  if (dbStatus === "warning") return "warning";
  return "online";
}

export function formatLastSeenRelative(lastSeen: string | null | undefined): string {
  if (!lastSeen) return "ยังไม่เคยเชื่อมต่อ";
  const ageSec = Math.max(0, (Date.now() - new Date(lastSeen).getTime()) / 1000);
  if (ageSec < 60) return `${Math.round(ageSec)} วินาทีที่แล้ว`;
  if (ageSec < 3600) return `${Math.round(ageSec / 60)} นาทีที่แล้ว`;
  if (ageSec < 86400) return `${Math.round(ageSec / 3600)} ชั่วโมงที่แล้ว`;
  return `${Math.round(ageSec / 86400)} วันที่แล้ว`;
}
