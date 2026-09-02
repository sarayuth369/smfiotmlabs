/**
 * Phase 6.9 — server-only client for the CUSTOMER-facing device
 * publish/read ops on the VPS provisioning webhook (same service Phase
 * 6.2 uses for provisioning, Phase 6.8 extends for admin — reused, not
 * duplicated). Every call is a POST to PROV_WEBHOOK_URL with a Bearer
 * token that lives ONLY in server environment variables.
 *
 * Callers MUST verify the caller owns (customer_uuid, device_uid) via
 * Supabase (iot_nodes -> farms.user_id) BEFORE calling anything here —
 * this module does not re-check ownership, it only talks to the broker.
 */

export type DeviceMqttKind =
  | "relay_cmd"
  | "ota_cmd"
  | "admin_cmd"
  | "config_schedule"
  | "config_rules"
  | "config_schedule_status"
  | "config_rules_status"
  | "relay_event"
  | "config_line"
  | "config_sheets"
  | "config_line_status"
  | "config_sheets_status";

type WebhookResult<T> = ({ ok: true } & T) | { ok: false; error: string };

async function callWebhook<T>(body: Record<string, unknown>): Promise<WebhookResult<T>> {
  const url = process.env.PROV_WEBHOOK_URL;
  const token = process.env.PROV_WEBHOOK_TOKEN;
  if (!url || !token) return { ok: false, error: "PROV_WEBHOOK_URL / PROV_WEBHOOK_TOKEN not configured" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const parsed: unknown = await res.json().catch(() => ({}));
    const obj = parsed as Record<string, unknown>;
    if (!res.ok || obj.ok !== true) {
      return { ok: false, error: (obj.error as string) ?? "webhook http " + res.status };
    }
    return obj as WebhookResult<T>;
  } catch (e) {
    return { ok: false, error: "webhook call failed: " + (e as Error).message };
  } finally {
    clearTimeout(timeout);
  }
}

export async function publishToDevice(
  customerUuid: string,
  deviceUid: string,
  kind: DeviceMqttKind,
  data: unknown,
  opts?: { channel?: number; retain?: boolean }
): Promise<WebhookResult<Record<string, never>>> {
  return callWebhook({
    op: "device-publish",
    customer_uuid: customerUuid,
    device_uid: deviceUid,
    kind,
    channel: opts?.channel,
    retain: opts?.retain,
    data,
  });
}

export async function getDeviceRetained<T = unknown>(
  customerUuid: string,
  deviceUid: string,
  kind: DeviceMqttKind,
  channel?: number
): Promise<WebhookResult<{ found: boolean; payload: T | null }>> {
  return callWebhook({
    op: "device-get-retained",
    customer_uuid: customerUuid,
    device_uid: deviceUid,
    kind,
    channel,
  });
}
