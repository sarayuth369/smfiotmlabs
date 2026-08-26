/**
 * Phase 6.13 — customer-facing API key generation/hashing.
 *
 * Unlike device-provisioning passwords (bcrypt — low-entropy, needs slow
 * hashing), an API key is itself 256 bits of cryptographic randomness, so a
 * fast one-way hash (SHA-256) is the correct/standard choice (same as
 * GitHub/Stripe) — verifying a key on every API request stays cheap.
 */

import { createHash, randomBytes } from "crypto";

const KEY_ENV_LABEL = "live"; // only one environment exists today; format leaves room for "test" later
const KEY_RANDOM_BYTES = 32;
const PREFIX_DISPLAY_LEN = 12; // shown in the UI to identify a key without revealing it

export type GeneratedApiKey = {
  plaintext: string; // return once, never store
  prefix: string; // safe to store + display
  hash: string; // sha256 hex — what's actually stored
};

export function generateApiKey(): GeneratedApiKey {
  const random = randomBytes(KEY_RANDOM_BYTES).toString("base64url");
  const plaintext = `smf_${KEY_ENV_LABEL}_${random}`;
  return {
    plaintext,
    prefix: plaintext.slice(0, PREFIX_DISPLAY_LEN),
    hash: hashApiKey(plaintext),
  };
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}
