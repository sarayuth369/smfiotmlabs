/**
 * MQTT contract + broker abstraction. Server-only — never import from client.
 *
 * Topics are centralized here so every publish/subscribe uses the same
 * pattern. Add/rename topics in ONE place.
 */

export type MqttTopicKind = "telemetry" | "status" | "command" | "response" | "config" | "event";

const TOPIC_BASE = "smfiot";

export function buildMqttTopic(deviceUid: string, kind: MqttTopicKind): string {
  return `${TOPIC_BASE}/${deviceUid}/${kind}`;
}

export function buildMqttClientId(deviceUid: string): string {
  return `smf_device_${deviceUid}`;
}

/** Payload contracts — kept minimal, extend as needed. */
export type CommandPayload = {
  command_id: string;
  command: string;
  timestamp: string;
  [key: string]: unknown;
};

/**
 * Publish to MQTT via HiveMQ Cloud HTTP REST API — short-lived request,
 * safe for Vercel serverless. Returns true on success.
 *
 * If HIVEMQ_HTTP_API_URL / HIVEMQ_HTTP_API_TOKEN are unset, returns false
 * silently (caller should insert command as 'pending' — worker picks it up).
 */
export async function publishMqtt(
  topic: string,
  payload: unknown,
  opts: { qos?: 0 | 1; retain?: boolean } = {}
): Promise<{ ok: boolean; error?: string }> {
  const apiUrl = process.env.HIVEMQ_HTTP_API_URL;
  const apiToken = process.env.HIVEMQ_HTTP_API_TOKEN;
  if (!apiUrl || !apiToken) {
    return { ok: false, error: "HiveMQ HTTP API not configured" };
  }

  try {
    const res = await fetch(`${apiUrl}/mqtt/publish`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        topic,
        payload: Buffer.from(JSON.stringify(payload)).toString("base64"),
        payloadFormatIndicator: "utf-8",
        qos: opts.qos ?? 1,
        retain: opts.retain ?? false,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HiveMQ publish failed: ${res.status} ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
