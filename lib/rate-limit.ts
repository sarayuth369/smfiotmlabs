/**
 * Rate limiting — pluggable interface + adapters.
 *
 * Default: in-memory token bucket per serverless invocation. Fail-open on
 * cold start / instance rotation (Vercel spawns fresh) — acceptable for
 * burst protection but NOT for sustained flood defense.
 *
 * Upgrade path: swap adapter to SupabaseLimiter (Section 24 aggregated
 * counter) or Upstash Redis for cross-instance persistence.
 *
 * Env:
 *   RATE_LIMIT_BACKEND=memory (default) | supabase | disabled
 *
 * All limits are configurable via env — defaults are conservative and match
 * legacy ESP32 publish cadence (~1 msg/10s = 6 msg/min).
 */

export type RateLimitBackend = "memory" | "supabase" | "disabled";

export type RateLimitCheck = {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
  reason?: string;
};

/**
 * Configurable limits — env override, sensible defaults.
 * All limits are per-window (60s default).
 */
export const RATE_LIMIT_CONFIG = {
  windowSec: parseInt(process.env.RATE_LIMIT_WINDOW_SEC ?? "60", 10),
  devicePerWindow: parseInt(process.env.MQTT_INGEST_DEVICE_RPM ?? "60", 10),
  customerPerWindow: parseInt(process.env.MQTT_INGEST_CUSTOMER_RPM ?? "600", 10),
  ipPerWindow: parseInt(process.env.MQTT_INGEST_IP_RPM ?? "300", 10),
  invalidPerWindow: parseInt(process.env.MQTT_INGEST_INVALID_RPM ?? "10", 10),
  maxPayloadBytes: parseInt(process.env.MQTT_INGEST_MAX_PAYLOAD_BYTES ?? "16384", 10),
  burstMultiplier: parseInt(process.env.RATE_LIMIT_BURST_MULTIPLIER ?? "2", 10),
};

// ============================================================
// Adapter interface
// ============================================================

export interface RateLimiter {
  readonly name: string;
  /**
   * Check whether an identifier can perform an action.
   * Returns `ok:true` if within limit + increments counter atomically.
   */
  check(bucket: string, key: string, limit: number, windowSec: number): Promise<RateLimitCheck>;
}

// ============================================================
// In-memory sliding-window token bucket (default)
// ============================================================

type BucketEntry = { tokens: number; lastRefillMs: number };

class InMemoryLimiter implements RateLimiter {
  readonly name = "memory";
  private buckets = new Map<string, BucketEntry>();
  private lastGcMs = 0;

  private gc(now: number) {
    // Sweep entries idle > 5 min every 60s to prevent unbounded memory
    if (now - this.lastGcMs < 60_000) return;
    this.lastGcMs = now;
    const cutoff = now - 5 * 60_000;
    for (const [key, entry] of this.buckets) {
      if (entry.lastRefillMs < cutoff) this.buckets.delete(key);
    }
  }

  async check(bucket: string, key: string, limit: number, windowSec: number): Promise<RateLimitCheck> {
    const now = Date.now();
    this.gc(now);
    const fullKey = `${bucket}:${key}`;
    const capacity = limit * RATE_LIMIT_CONFIG.burstMultiplier;
    const refillPerMs = limit / (windowSec * 1000);

    let entry = this.buckets.get(fullKey);
    if (!entry) {
      entry = { tokens: capacity, lastRefillMs: now };
      this.buckets.set(fullKey, entry);
    } else {
      const elapsed = now - entry.lastRefillMs;
      entry.tokens = Math.min(capacity, entry.tokens + elapsed * refillPerMs);
      entry.lastRefillMs = now;
    }

    if (entry.tokens < 1) {
      const retryAfterSec = Math.ceil((1 - entry.tokens) / refillPerMs / 1000);
      return { ok: false, remaining: 0, retryAfterSec, reason: `${bucket} rate limit` };
    }

    entry.tokens -= 1;
    return { ok: true, remaining: Math.floor(entry.tokens), retryAfterSec: 0 };
  }
}

// ============================================================
// Supabase-backed limiter (cross-instance, higher cost)
// Uses `ingest_rate_events` table — periodic counter aggregation.
// Stub — enable when persistent limiter required across serverless instances.
// ============================================================

class SupabaseLimiter implements RateLimiter {
  readonly name = "supabase";

  async check(bucket: string, key: string, limit: number, windowSec: number): Promise<RateLimitCheck> {
    // Contract when enabled: call RPC ingest_rate_check(bucket, key, limit, windowSec)
    //   → increment counter, return remaining. See Section 24 SQL.
    // Falls open (allow) if RPC missing/errors — safer than blocking all telemetry.
    console.warn(
      `[rate-limit] SupabaseLimiter not implemented for ${bucket}:${key} — falling open`
    );
    return { ok: true, remaining: limit, retryAfterSec: 0 };
  }
}

// ============================================================
// Disabled limiter (always pass — dev/testing only)
// ============================================================

class DisabledLimiter implements RateLimiter {
  readonly name = "disabled";
  async check(_bucket: string, _key: string, limit: number): Promise<RateLimitCheck> {
    return { ok: true, remaining: limit, retryAfterSec: 0 };
  }
}

// ============================================================
// Factory
// ============================================================

let cached: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (cached) return cached;
  const backend = (process.env.RATE_LIMIT_BACKEND ?? "memory") as RateLimitBackend;
  switch (backend) {
    case "supabase":
      cached = new SupabaseLimiter();
      break;
    case "disabled":
      cached = new DisabledLimiter();
      break;
    default:
      cached = new InMemoryLimiter();
  }
  return cached;
}

export function _resetRateLimiterCache() {
  cached = null;
}

// ============================================================
// High-level helpers — use these from route handlers
// ============================================================

export async function checkDeviceRateLimit(deviceUid: string): Promise<RateLimitCheck> {
  return getRateLimiter().check(
    "device",
    deviceUid,
    RATE_LIMIT_CONFIG.devicePerWindow,
    RATE_LIMIT_CONFIG.windowSec
  );
}

export async function checkCustomerRateLimit(customerIdentityId: string): Promise<RateLimitCheck> {
  return getRateLimiter().check(
    "customer",
    customerIdentityId,
    RATE_LIMIT_CONFIG.customerPerWindow,
    RATE_LIMIT_CONFIG.windowSec
  );
}

export async function checkIpRateLimit(ip: string): Promise<RateLimitCheck> {
  return getRateLimiter().check(
    "ip",
    ip,
    RATE_LIMIT_CONFIG.ipPerWindow,
    RATE_LIMIT_CONFIG.windowSec
  );
}

/** Invalid request bucket — much stricter, protects against auth flood. */
export async function checkInvalidRequestLimit(ip: string): Promise<RateLimitCheck> {
  return getRateLimiter().check(
    "invalid",
    ip,
    RATE_LIMIT_CONFIG.invalidPerWindow,
    RATE_LIMIT_CONFIG.windowSec
  );
}
