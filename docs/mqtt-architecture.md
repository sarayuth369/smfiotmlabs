# SMF IoT — MQTT Architecture

Single source of truth for MQTT design: topics, credentials, provisioning, security. Refer here before touching MQTT code.

## Component overview

```
ESP32 (per-device credential, secrets.h gitignored)
  ↓ mqtts://8883 (TLS)
HiveMQ Cloud (Free tier now, Starter+ future)
  ↓ subscribe farm/# + smf/+/+/*
Railway Bridge (Node.js worker, single always-on process)
  ↓ HMAC-signed POST batches
Vercel /api/telemetry/ingest (Next.js server action)
  ↓ Supabase service_role
Supabase Postgres (RLS: sensor → device → farm → auth.uid)
  ↓ read via Supabase JS + client polling
Web dashboard (5s polling latest cache)
```

## Topic namespaces (dual-mode during migration)

### Legacy (single-tenant, current SMF001 test unit)
| Topic | Payload | Direction |
|---|---|---|
| `farm/temp` | `{"temperature":28.5}` | ESP32→broker |
| `farm/humidity` | `{"humidity":74.3}` | ESP32→broker |
| `farm/light` | `{"lux":532.0}` | ESP32→broker |
| `farm/soil` | `{"ph":6.5,"ec":420,"n":45,"p":22,"k":68}` | ESP32→broker |
| `farm/power` | `{"v":230,"a":1.2,"w":276}` | ESP32→broker |
| `farm/device/status` | `{"online":true,"rssi":-42,"time":"14:03:11"}` | ESP32→broker |
| `farm/relay/{ch}/status` | `{"state":true}` | ESP32→broker |
| `farm/relay/{ch}/set` | `{"state":true}` | broker→ESP32 |

**Limitation:** cannot host >1 ESP32 per broker without topic collision. `legacy_device_mappings.legacy_topic_prefix` maps `farm` → 1 SMF device.

### New multi-tenant (future firmware after per-device UID prefix)
| Pattern | Purpose |
|---|---|
| `smf/{customer_identity_id}/{device_uid}/telemetry` | Batched sensor payload |
| `smf/{customer_identity_id}/{device_uid}/status` | Heartbeat + firmware_version |
| `smf/{customer_identity_id}/{device_uid}/command` | Web→device commands |
| `smf/{customer_identity_id}/{device_uid}/response` | Command ack |
| `smf/{customer_identity_id}/{device_uid}/config` | Device config push |
| `smf/{customer_identity_id}/{device_uid}/relay/{ch}/set` | Relay control |
| `smf/{customer_identity_id}/{device_uid}/relay/{ch}/status` | Relay ack |
| `smf/{customer_identity_id}/{device_uid}/event/{type}` | Async device events |

**Enforcement (Starter+ tier):** ACL restricts each device credential to `smf/{cust}/{own_uid}/#`. Device cannot publish/subscribe others' topics even if it tries.

### Bridge subscribes both (Phase 4.2)
```typescript
// lib/mqtt-topics.ts:BRIDGE_SUBSCRIBE_PATTERNS
[
  "farm/temp","farm/humidity","farm/light","farm/soil","farm/power",
  "farm/device/status","farm/relay/+/status",
  "smf/+/+/telemetry","smf/+/+/status","smf/+/+/response",
  "smf/+/+/event/+","smf/+/+/relay/+/status",
]
```

## Provisioning modes

Env: `MQTT_PROVISIONING_MODE=manual` (default) | `automatic` (future)

### Manual mode (HiveMQ Free — current)
```
Admin/User → SMF Web MQTT Config → click Regenerate
  → SMF generates username+password (32-byte random)
  → bcrypt hash stored in device_credentials
  → plaintext returned to UI ONCE
  → Admin copies plaintext → HiveMQ Dashboard → Create Credential manually
  → ESP32 flashed with matching plaintext (via secrets.h)
```

### Automatic mode (HiveMQ Starter+ — future)
```
Admin/User → SMF Web MQTT Config → click Regenerate
  → SMF generates username+password
  → SMF backend calls HiveMQ REST API: POST /api/v1/authentication/users
  → Server sets ACL: publish/subscribe `smf/{customer}/{uid}/#` only
  → bcrypt hash stored + plaintext returned to UI ONCE
  → ESP32 flashed with matching plaintext
```

Adapter pattern: `lib/mqtt-credential.ts` — swap `HivemqCloudAdapter` for other brokers (EMQX, Mosquitto) without touching business logic.

## Credential storage rules

**`device_credentials` table** stores:
- `mqtt_username` — plaintext username (matches HiveMQ Dashboard)
- `mqtt_password_hash` — bcrypt hash only
- `mqtt_password_prefix` — first 4 chars for UI display
- `mqtt_password_last4` — last 4 chars for UI display
- `created_at`, `rotated_at`, `revoked_at` — audit trail

**Never stored:** plaintext password. Regenerate = create new row + set `revoked_at` on old (partial UNIQUE `(device_id) WHERE revoked_at IS NULL` enforces one active per device).

**Never logged:** password, HiveMQ Management API token, Supabase service_role key.

## Ingest security (unchanged from Phase 9)

Bridge → Vercel `/api/telemetry/ingest`:
- HMAC-SHA256 header `x-ingest-signature` of raw body using shared `TELEMETRY_INGEST_SECRET`
- Server verifies signature (timing-safe)
- Payload sanity: timestamp ±5min/-30day, batch max 100 readings
- Device resolution via `legacy_device_mappings` (legacy) or direct `iot_nodes.device_uid` (new)
- Sensor lookup via `(device_id, sensor_type, channel)` — reject unknown

## Plan limit integration

Device creation gate: `canCreateNode(supabase, userId)` from [lib/plan-limits.ts](../lib/plan-limits.ts). Called BEFORE `iot_nodes` insert.

Credential provisioning happens AFTER device creation → no orphan credentials on limit-hit rejection.

## Bridge trust model

**Bridge does NOT trust MQTT topic path.** Even if topic says `smf/CUS001/SMF001/telemetry`, bridge must:
1. Extract `customer_identity_id` + `device_uid` from topic
2. Query `iot_nodes JOIN farms JOIN profiles JOIN customer_identities` — verify `device_uid` actually belongs to `customer_identity_id`
3. If mismatch → drop message + log `mqtt_topology_violation` event
4. If disabled or archived → drop

This defense holds even without broker ACL — protects Free-tier deployment.

## Migration path — Free → Starter

**Current (Free tier):**
- 1 credential = all devices (manual dashboard mgmt)
- No ACL — broker layer open, RLS + bridge validation = only defense
- Max 5 credentials, 10 GB/mo, 100 concurrent sessions

**Upgrade trigger:** first paying customer OR >5 devices needed
- `MQTT_PROVISIONING_MODE=automatic` env change
- Add `HIVEMQ_MGMT_API_URL` + `HIVEMQ_MGMT_API_TOKEN` env
- No code refactor needed — adapter swaps automatically

**Firmware reflash (per device):** replace shared credential with per-device credential in `secrets.h`. Bridge continues subscribing both patterns during transition.

## Compat matrix

| Layer | Legacy (`farm/*`) | New (`smf/*`) | Notes |
|---|---|---|---|
| Firmware SMF001 | ✅ current | ⏸ pending reflash | Firmware constants swap |
| Firmware new units | Optional | ✅ recommended | Per-device UID + prefix |
| Flutter App | ✅ user pastes broker config | ⏸ Phase 4.3+ auto-provision | Settings screen unchanged |
| Railway Bridge | ✅ subscribes | ✅ subscribes | Dual-mode via `BRIDGE_SUBSCRIBE_PATTERNS` |
| Ingest API | ✅ resolves via `legacy_device_mappings` | ✅ resolves via `iot_nodes.device_uid` | Same DB write path |
| Web MQTT config page | ✅ shows current topic pattern | ✅ shows new topic pattern (when Starter tier active) | Reads `mqtt_topic_prefix` from device row |

## What NOT to change without spec

- Payload shape — Flutter parser strict on field names
- HMAC signing algo — bridge in Railway needs matching secret
- `TELEMETRY_INGEST_SECRET` env — rotating breaks Bridge until env updated
- Legacy topic set — SMF001 firmware hardcodes `farm/*`
