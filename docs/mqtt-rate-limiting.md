# MQTT Rate Limiting & Abuse Protection

Reference for Phase 4.5 defenses against flood attacks + accidental ESP32 misconfiguration.

## Architecture (multi-layer)

```
ESP32 (well-behaved: ~1 msg/10s = 6 rpm)
  ↓
HiveMQ (no per-client rate limit on Free tier)
  ↓
Railway Bridge
  ├─ 16 KB payload check
  ├─ Per-device token bucket (60 rpm × 2 burst = 120 capacity)
  ├─ Sampled rejection log (60s aggregation, no per-msg log)
  └─ Bounded 2s debounce buffer (flat legacy fields only)
  ↓ HMAC POST
Vercel /api/telemetry/ingest
  ├─ 16 KB payload check
  ├─ Per-IP rate limit (300 rpm × 2 burst)
  ├─ HMAC verify — fail = invalid bucket (10 rpm) + 401
  ├─ Per-device rate limit (60 rpm × 2 burst)
  ├─ Per-customer rate limit (600 rpm × 2 burst)
  ↓
Supabase inserts (only if all limits pass)
```

## Limits (env-configurable)

| Env var | Default | Purpose |
|---|---|---|
| `RATE_LIMIT_BACKEND` | `memory` | `memory` / `supabase` / `disabled` |
| `RATE_LIMIT_WINDOW_SEC` | `60` | Window size for all buckets |
| `MQTT_INGEST_DEVICE_RPM` | `60` | Per-device requests/min (10× normal cadence) |
| `MQTT_INGEST_CUSTOMER_RPM` | `600` | Per-customer sum across all devices |
| `MQTT_INGEST_IP_RPM` | `300` | Per bridge/gateway IP |
| `MQTT_INGEST_INVALID_RPM` | `10` | Auth failures per IP — aggressive |
| `MQTT_INGEST_MAX_PAYLOAD_BYTES` | `16384` | 16 KB cap |
| `RATE_LIMIT_BURST_MULTIPLIER` | `2` | Bucket capacity = rpm × mult |
| `BRIDGE_DEVICE_RPM` (bridge) | `60` | Per-device at bridge — same default as ingest |
| `BRIDGE_RATE_LIMIT_WINDOW_SEC` (bridge) | `60` | Window at bridge |
| `BRIDGE_BURST_MULT` (bridge) | `2` | Burst capacity |

**Reasoning:** ESP32 firmware publishes status every 10s + telemetry per topic every 5-10s → ~6-12 msg/min per device. 60 rpm default = 5-10× normal cadence = catches sustained abuse without touching normal traffic.

## Algorithm — Token Bucket (sliding refill)

- Capacity = `rpm × burst_multiplier` (60 × 2 = 120 tokens)
- Refill rate = `rpm / (window_sec × 1000)` tokens per ms
- Every request consumes 1 token
- Bucket empty → 429 with `Retry-After: N` seconds header

**Burst handling:** ESP32 reconnect after outage can flush queued messages → 120 token buffer absorbs 2 min of pent-up publishing.

**Cross-instance limitation:** Vercel serverless spawns fresh instances → each instance has own token bucket → attacker distributing load across N instances gets N × 120 burst. Acceptable for MVP — sustained attack still capped by CPU/DB latency. Upgrade to Supabase adapter when this matters.

## Fail-open policy

- Rate limiter throws → fall through, allow request (never block telemetry due to limiter bug)
- Supabase backend RPC missing → warn + allow
- Rationale: dropping legitimate telemetry = customer sensor gap = worse than accepting occasional flood

## Invalid request bucket (aggressive)

Separate bucket for auth failures (invalid HMAC, oversized payload). 10 rpm per IP = 1 attempt per 6s max. Protects against:
- HMAC brute-force
- Guessing endpoint schema
- Credential enumeration

## Plan vs rate limit

**Separate systems:**

| | Plan limit | Rate limit |
|---|---|---|
| Purpose | Business (subscription cap) | Technical (abuse protection) |
| Enforced at | Web dashboard (create resources) | API ingest (message velocity) |
| Config | Admin UI | Env vars |
| Failure | "อัปเกรดแพ็กเกจ" prompt | HTTP 429 + retry-after |

Rate limits **do not** vary by plan yet (all plans get 60 rpm/device). Future extension: Enterprise custom rate via `subscription_plans.ingest_rpm` column.

## Bridge protection

- **Payload:** 16 KB check pre-parse (already in Phase 4.3)
- **Rate:** in-memory token bucket per device (Phase 4.5) — bridge = persistent Node process = in-memory is authoritative
- **Log spam:** sampled — count rejections per 60s window, log aggregate once
- **Memory:** GC idle device buckets every 60s (5-min idle threshold)
- **Buffer:** legacy debounce buffer is flat map (not queue) — cannot grow unbounded

## Retry policy (Bridge → Vercel)

- 4xx client errors → NO retry (would loop forever)
- 5xx server errors → log, DROP (no retry queue yet — Phase 12 backlog)
- Network errors → log, DROP
- MQTT reconnect → auto via mqtt.js library, exponential backoff built-in

**Trade-off:** dropping on 5xx = brief data loss during Vercel incidents. Alternative = in-memory retry queue with bounded size + dead-letter log. Not implemented — QoS 1 at HiveMQ redelivers on bridge reconnect anyway.

## Database flood protection

- Rate limit **before** any Supabase write → attacker cannot fill `sensor_readings`
- `device_events` insert only on legitimate status change (not per rejected packet)
- Rejection logs go to Vercel/Railway stdout, not DB (no `security_events` table flooding)

## Response security

Reject responses expose minimal info:
- `400` = "Invalid telemetry" / "payload too large"
- `401` = "unauthorized"
- `403` = "customer/device ownership mismatch"
- `404` = "unknown device"
- `413` = "payload too large"
- `429` = "rate limit exceeded" + `Retry-After` header

Never expose: Supabase error text, HMAC internals, service_role hints, internal IDs beyond what the caller sent.

## Monitoring (recommended additions — Phase 4.6+)

- Vercel Log Drain → SIEM (Datadog / Grafana) filter for `[rate-limit]` + `[security]`
- Admin dashboard tile: rejections in last hour by bucket
- Alert on invalid RPM > 5 for 10 minutes = likely attack

## Test cases (manual)

| # | Setup | Expected |
|---|---|---|
| 1 | Normal SMF001 (6 rpm) | All accepted |
| 2 | Burst 120 msgs in 10s | First 120 accepted, rest 429 |
| 3 | Sustained 200 rpm | 60 rpm accepted, 140 rejected 429 |
| 4 | Wrong HMAC × 20 | First 10 → 401, next 10 → 429 (invalid bucket) |
| 5 | Oversized 20KB body | 413 immediately |
| 6 | Cross-instance flood (multi-region) | Each region has own bucket — total = N × 120 (known limitation) |
| 7 | Bridge dropped msg due to rate limit | Only 60s aggregate log, not per-msg |
| 8 | Rate limiter throws (bug) | Fall-open, telemetry passes |

## Configuration examples

**Dev / testing (looser):**
```
RATE_LIMIT_BACKEND=disabled
```

**Production baseline (default):**
```
# No env vars needed — defaults apply
```

**High-frequency sensor (60 msgs/min per device):**
```
MQTT_INGEST_DEVICE_RPM=120
BRIDGE_DEVICE_RPM=120
```

**Strict abuse response:**
```
MQTT_INGEST_INVALID_RPM=3
```

## Future extensions (Phase 12+)

- Upstash Redis adapter → cross-instance state
- Persistent retry queue (Bridge-side) with bounded size + DLQ
- Per-plan rate limits from `subscription_plans` column
- Anomaly detection: sudden drop in device RPM → alert (device down?)
- IP allowlist for bridge (only accept from Railway IP range)
