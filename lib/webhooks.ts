/**
 * Phase 6.13 — Business/Premium webhooks.
 *
 * Secret is stored AES-256-GCM encrypted (WEBHOOK_SECRET_ENC_KEY, 32 raw
 * bytes) rather than hashed — unlike an API key, delivery needs the
 * PLAINTEXT secret to sign each outgoing payload, so a one-way hash won't
 * work here. Dispatch is a bounded synchronous retry (no queue infra) —
 * proportionate to the volume this feature will see.
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const ALGO = "aes-256-gcm";
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = [0, 1000, 2000];
const DELIVERY_TIMEOUT_MS = 5000;

function encKey(): Buffer {
  const raw = process.env.WEBHOOK_SECRET_ENC_KEY;
  if (!raw) throw new Error("WEBHOOK_SECRET_ENC_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("WEBHOOK_SECRET_ENC_KEY must decode to exactly 32 bytes");
  return key;
}

export function encryptWebhookSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, encKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptWebhookSecret(encoded: string): string {
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, encKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

function signPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

type WebhookRow = { id: string; url: string; secret_encrypted: string };

async function deliverOnce(url: string, body: string, signature: string): Promise<{ ok: boolean; status: number | null }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-SMF-Signature": signature },
      body,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: null };
  }
}

async function deliverWithRetry(admin: SupabaseClient, webhook: WebhookRow, eventType: string, payload: Record<string, unknown>): Promise<void> {
  const body = JSON.stringify({ event: eventType, data: payload, sent_at: new Date().toISOString() });
  const secret = decryptWebhookSecret(webhook.secret_encrypted);
  const signature = signPayload(secret, body);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (RETRY_DELAY_MS[attempt - 1]) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS[attempt - 1]));
    const result = await deliverOnce(webhook.url, body, signature);

    await admin.from("webhook_deliveries").insert({
      webhook_id: webhook.id,
      event_type: eventType,
      payload,
      status: result.ok ? "success" : "failed",
      response_code: result.status,
      attempt,
    });

    if (result.ok) return;
  }
}

/**
 * Fires `eventType` to every enabled webhook this user has subscribed to
 * it. Cheap no-op (one indexed query, no matches) for the common case of
 * an account with zero webhooks — safe to call from the hot ingest path.
 */
export async function dispatchWebhookEvent(
  admin: SupabaseClient,
  userId: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  const { data: hooks } = await admin
    .from("webhooks")
    .select("id, url, secret_encrypted")
    .eq("user_id", userId)
    .eq("enabled", true)
    .contains("events", [eventType]);

  const list = (hooks ?? []) as WebhookRow[];
  if (list.length === 0) return;

  await Promise.all(list.map((w) => deliverWithRetry(admin, w, eventType, payload)));
}

/** Manual "Test Webhook" button — single attempt, no retry, returns the result inline. */
export async function sendTestWebhook(
  admin: SupabaseClient,
  webhook: WebhookRow
): Promise<{ ok: boolean; status: number | null }> {
  const body = JSON.stringify({ event: "test", data: { message: "SMF IoT test webhook" }, sent_at: new Date().toISOString() });
  const secret = decryptWebhookSecret(webhook.secret_encrypted);
  const signature = signPayload(secret, body);
  const result = await deliverOnce(webhook.url, body, signature);

  await admin.from("webhook_deliveries").insert({
    webhook_id: webhook.id,
    event_type: "test",
    payload: { message: "SMF IoT test webhook" },
    status: result.ok ? "success" : "failed",
    response_code: result.status,
    attempt: 1,
  });

  return result;
}
