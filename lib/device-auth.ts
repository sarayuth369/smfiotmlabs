/**
 * Per-device MQTT credential generation. Server-only.
 *
 * Password is shown ONCE at creation time (returned by generate) — never
 * stored plaintext. Only bcrypt hash + first-4-char prefix are persisted.
 */

import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

export type GeneratedCredential = {
  mqtt_username: string;
  mqtt_password: string; // plaintext — return once, never store
  mqtt_password_hash: string;
  mqtt_password_prefix: string;
};

/** Random URL-safe password. 32 bytes = 43 chars base64url. */
function randomPassword(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Generate new credential. Username = device_uid (matches mqtt_client_id
 * prefix for easy ACL: `mosquitto_auth pubsub smfiot/{username}/+`).
 */
export async function generateDeviceCredential(deviceUid: string): Promise<GeneratedCredential> {
  const password = randomPassword();
  const hash = await bcrypt.hash(password, 10);
  return {
    mqtt_username: deviceUid,
    mqtt_password: password,
    mqtt_password_hash: hash,
    mqtt_password_prefix: password.slice(0, 4),
  };
}

export async function verifyDevicePassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}
