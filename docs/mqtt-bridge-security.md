# MQTT Bridge Security & Validation

Reference for the Railway MQTT bridge (repo: `D:\Websites\smfiot-bridge`, deploy: Railway) — how it validates messages before forwarding to Vercel ingest.

## Trust model

MQTT publishers = untrusted. Anyone with a broker credential can publish arbitrary topics. Bridge treats every message as hostile input until proven otherwise.

Validation stages (any failure = drop, log, keep bridge alive):

```
MQTT message
  ↓ size ≤ 16 KB                              [security: payload too large]
  ↓ topic matches known pattern               [security: topic rejected]
  ↓ topic parts pass regex + length limits    [security: topic rejected]
  ↓ JSON parses + is object                   [security: invalid json]
  ↓ route to handler by parsed.kind
  ↓ handler filters unknown/malformed fields
  ↓ HMAC-sign body → POST /api/telemetry/ingest
                             ↓
                    Vercel ingest
                    ↓ verify HMAC (timing-safe)
                    ↓ resolve device_uid → iot_nodes
                    ↓ device not disabled/archived
                    ↓ IF customer_identity_id present:
                    ↓   cross-check against device.farm.user.customer_identity_id
                    ↓ ELSE (legacy): trust device_uid + rely on bridge single-tenant mode
                    ↓ timestamp within ±5min future / -30 days past
                    ↓ resolve sensors by (type, channel) — reject unknown
                    ↓ insert sensor_readings
                    ↓ trigger sensor_readings_latest cache (DB trigger)
                    ↓ update iot_nodes.last_seen + status
                    ↓ run automation rule engine
```

## Topic namespaces (dual-mode)

**Legacy** (single-tenant, current SMF001):
```
farm/temp             farm/humidity        farm/light
farm/soil             farm/power           farm/device/status
farm/relay/{ch}/status
```
Bridge uses env `DEVICE_UID` as the SMF device — 1 bridge instance = 1 device. Ingest does NOT cross-check customer (bridge doesn't send `customer_identity_id`).

**New multi-tenant** (future firmware):
```
smf/{customer_identity_id}/{device_uid}/telemetry
smf/{customer_identity_id}/{device_uid}/status
smf/{customer_identity_id}/{device_uid}/response
smf/{customer_identity_id}/{device_uid}/event/{type}
```
Bridge extracts `customer_identity_id + device_uid` from topic. Ingest cross-checks via `iot_nodes → farms → profiles → customer_identity_id`. Mismatch = 403 `ownership mismatch`.

## Parser guards (bridge.js)

- Topic parts filter empty strings → `smf/CUS001//telemetry` = parse fail
- `customer_identity_id` + `device_uid` must match `/^[A-Za-z0-9_:-]{1,64}$/` → path traversal / injection prevented
- `kind` must be in whitelist `{telemetry, status, response, event}` → unknown types rejected
- `parts.length < 4` for new namespace → shortcut topics rejected
- Legacy sub-topics whitelisted explicitly (`temp`, `humidity`, ..., `relay/N/status`)

## Payload guards

- Byte size checked before JSON parse (16 KB hard cap)
- `JSON.parse` in try/catch — malformed = drop
- Result must be object (`null` + arrays rejected)
- Handler filters expected fields per message kind
- Numeric fields checked with `typeof === "number"` (rejects strings, NaN)

## HMAC (Bridge → Vercel)

- Algorithm: `HMAC-SHA256(body_string, TELEMETRY_INGEST_SECRET) → hex`
- Header: `x-ingest-signature`
- Server: `timingSafeEqual` (constant-time compare)
- Length pre-check to prevent length-based side-channel

**Rotation:** update `TELEMETRY_INGEST_SECRET` in both Vercel + Railway env. Rolling deploy = brief window of mismatch = 401. Rebound automatically after both deploys settle.

## Replay protection

- Each reading has `message_id: crypto.randomUUID()` — unique per POST
- Partial UNIQUE index `sensor_readings_msg_uniq (sensor_id, message_id) WHERE message_id IS NOT NULL` = duplicate insert = PG error 23505 → ingest ignores
- Server clock timestamp bounds: ±5min future, -30 days past → ancient/future messages rejected
- **Not yet:** signed nonce in HMAC input → future add if replay attacks observed

## Ownership cross-check (multi-tenant)

Ingest resolves device chain:
```sql
select id, is_disabled, archived_at, farms(user_id, profiles(customer_identity_id))
from iot_nodes
where device_uid = $1
```

If `body.customer_identity_id` provided by bridge:
- `actual = device.farms.profiles.customer_identity_id`
- If null OR ≠ `body.customer_identity_id` → 403 `ownership mismatch`
- Logged with topic + actual + claimed values for audit

## Legacy compat

Bridge sends `customer_identity_id: null` for `farm/*` messages → ingest skips cross-check. Legacy is inherently single-tenant per bridge instance. SMF001 test unit protected by:
1. HiveMQ credential (only one credential per broker in Free tier)
2. Only 1 bridge instance running (1 broker → 1 device)

## Error handling & resilience

- `try/catch` around every message handler
- `process.on("uncaughtException")` logs but does NOT exit → bridge stays alive
- MQTT client `autoReconnect: true` + `reconnectPeriod: 5s`
- Ingest 4xx = don't retry (bad request, would loop)
- Ingest 5xx = log (retry logic future — currently drops)
- SIGTERM = clean shutdown, close MQTT gracefully

## Logging (no secrets)

Bridge:
```
[mqtt] connected to mqtts://...
[mqtt] subscribed 11 topics
[ingest] {"ok":true,"inserted":2,...}
[security] topic rejected farm/unknown
[security] payload too large farm/temp 20480
[security] invalid json farm/temp Unexpected token
[security] ingest rejected 403 {"error":"ownership mismatch"}
```

Ingest (Vercel logs):
```
[security] ownership mismatch topic_customer=X actual_customer=Y device_uid=Z
```

**Never logged:** `HIVEMQ_PASS`, `TELEMETRY_INGEST_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, plaintext bodies (only summaries).

## Rate / abuse (Phase 12 backlog)

Currently:
- Payload size limit ✅ (16 KB)
- Reconnect backoff ✅ (mqtt library default exponential)
- No per-device rate limit ❌ — attacker with 1 credential can flood
- No global bridge rate limit ❌ — malicious traffic fills bandwidth

Future add (Upstash Redis + edge middleware on ingest endpoint).

## Test cases

Bridge unit-testable (pure functions in `parseTopic`, `handleMessage`). E2E requires live broker + Railway + Vercel + ESP32.

| # | Input | Expected |
|---|---|---|
| 1 | `smf/CUS001/SMF001/telemetry` `{"temperature":30}` | Parsed, ingested |
| 2 | `smf/CUS001/SMF001/status` `{"online":true}` | Status update, no readings |
| 3 | `smf/CUS001/SMF001/unknown` | `topic rejected` |
| 4 | `smf//SMF001/telemetry` | `topic rejected` (empty part) |
| 5 | `smf/CUS002/SMF001/telemetry` (SMF001 owner=CUS001) | Ingest returns 403 `ownership mismatch` |
| 6 | Malformed JSON | `invalid json`, bridge alive |
| 7 | 20 KB payload | `payload too large`, dropped |
| 8 | `farm/temp` `{"temperature":30}` (DEVICE_UID=SMF001 env) | Buffered, flushed with device_uid=SMF001 |
| 9 | `farm/unknown` | `topic rejected` |
| 10 | Same message_id twice | Second insert = 23505, ignored (idempotent) |
| 11 | Missing `x-ingest-signature` header | Ingest 401 `unauthorized` |
| 12 | Vercel 500 | Log error, drop (no retry loop) |
| 13 | Malformed MQTT with binary payload | Parse error, bridge alive |

## Firmware requirements for new namespace

ESP32 firmware to use `smf/*` namespace:

1. Flash-time constants `DEVICE_UID` + `CUSTOMER_IDENTITY_ID` (from claim/provisioning)
2. Topic format: `String(NEW_NAMESPACE) + "/" + CUSTOMER_IDENTITY_ID + "/" + DEVICE_UID + "/telemetry"`
3. Batched telemetry payload:
```json
{
  "temperature": 28.5,
  "humidity": 74,
  "soil_moisture": 45,
  "timestamp": "2026-08-18T14:03:11Z"
}
```
4. Status payload extended with firmware version:
```json
{
  "online": true,
  "rssi": -42,
  "firmware_version": "2.31.0"
}
```

Until firmware updated: legacy `farm/*` continues working via bridge single-tenant fallback.

## Files (Bridge repo D:\Websites\smfiot-bridge)

- `bridge.js` — updated in Phase 4.3
- `package.json` — unchanged
- `.gitignore` — unchanged
- `README.md` — env var reference
