/**
 * Phase 6.8 — server-only client for the admin MQTT/bridge management
 * ops on the VPS provisioning webhook (same service Phase 6.2 uses for
 * device provisioning — reused, not duplicated). Every call here is a
 * POST to PROV_WEBHOOK_URL with a Bearer token that lives ONLY in server
 * environment variables. This module must never be imported from a
 * "use client" file — there is no client-safe path through it.
 */

const DEVICE_UID_RE = /^SMF-[A-F0-9]{6,20}$/;

export type MqttUser = {
  username: string;
  enabled: boolean;
  connected_clients: number;
};

export type MqttClient = {
  clientid: string;
  username: string | null;
  ip_address: string | null;
  connected_at: string | null;
  keepalive: number | null;
  connected: boolean;
  proto_name: string | null;
};

export type BrokerStats = {
  node_status: string;
  version: string;
  uptime_ms: number | null;
  connections: number | null;
  sessions: number | null;
  subscriptions: number | null;
  topics: number | null;
  messages_received: number | null;
  messages_sent: number | null;
  messages_dropped: number | null;
};

export type BridgeStatus = {
  name: string;
  found: boolean;
  status?: string;
  running?: boolean;
  started_at?: string | null;
  restart_count?: number | null;
  cpu_percent?: number | null;
  mem_mb?: number | null;
  last_ingest_log?: string | null;
  recent_errors?: string[];
};

type WebhookResult<T> = { ok: true } & T | { ok: false; error: string };

async function callWebhook<T>(op: string, extra?: Record<string, unknown>): Promise<WebhookResult<T>> {
  const url = process.env.PROV_WEBHOOK_URL;
  const token = process.env.PROV_WEBHOOK_TOKEN;
  if (!url || !token) return { ok: false, error: "PROV_WEBHOOK_URL / PROV_WEBHOOK_TOKEN not configured" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ op, ...extra }),
      signal: controller.signal,
    });
    const body: unknown = await res.json().catch(() => ({}));
    const bodyObj = body as Record<string, unknown>;
    if (!res.ok || bodyObj.ok !== true) {
      return { ok: false, error: (bodyObj.error as string) ?? "webhook http " + res.status };
    }
    return bodyObj as WebhookResult<T>;
  } catch (e) {
    return { ok: false, error: "webhook call failed: " + (e as Error).message };
  } finally {
    clearTimeout(timeout);
  }
}

export function isValidMqttUsername(username: string): boolean {
  return DEVICE_UID_RE.test(username);
}

export async function listMqttUsers(): Promise<WebhookResult<{ users: MqttUser[] }>> {
  return callWebhook("list-users");
}

export async function listMqttClients(): Promise<WebhookResult<{ clients: MqttClient[] }>> {
  return callWebhook("list-clients");
}

export async function getBrokerStats(): Promise<WebhookResult<{ stats: BrokerStats }>> {
  return callWebhook("broker-stats");
}

export async function getBridgeStatus(): Promise<WebhookResult<{ bridge: BridgeStatus }>> {
  return callWebhook("bridge-status");
}

export async function getLegacyBridgeStatus(): Promise<WebhookResult<{ legacy: BridgeStatus[] }>> {
  return callWebhook("legacy-bridge-status");
}

export async function restartBridge(): Promise<WebhookResult<Record<string, never>>> {
  return callWebhook("bridge-restart");
}

export async function disableMqttUser(username: string): Promise<WebhookResult<{ kicked: number }>> {
  if (!isValidMqttUsername(username)) return { ok: false, error: "invalid username format" };
  return callWebhook("disable-user", { username });
}

export async function enableMqttUser(username: string): Promise<WebhookResult<Record<string, never>>> {
  if (!isValidMqttUsername(username)) return { ok: false, error: "invalid username format" };
  return callWebhook("enable-user", { username });
}

export async function deleteMqttUser(username: string): Promise<WebhookResult<Record<string, never>>> {
  if (!isValidMqttUsername(username)) return { ok: false, error: "invalid username format" };
  return callWebhook("delete-user", { username });
}
