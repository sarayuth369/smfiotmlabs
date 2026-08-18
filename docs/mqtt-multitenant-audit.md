# SMF IoT — MQTT Multi-Tenant Architecture Audit (Special Phase 4.1)

**Status:** Audit + Design only. No code changes in this phase.
**Related docs:**
- [existing-app-mqtt-analysis.md](existing-app-mqtt-analysis.md)
- [mqtt-integration-gap-analysis.md](mqtt-integration-gap-analysis.md)
- [esp32-mqtt-integration-spec.md](esp32-mqtt-integration-spec.md)
- [esp32-firmware-analysis.md](esp32-firmware-analysis.md)
- [real-esp32-web-test-plan.md](real-esp32-web-test-plan.md)

---

## 1. Current Architecture

```
ESP32 (shared credential smfiot:Smfiot4556#)
  ↓ mqtts://8883 — farm/temp, farm/humidity, farm/device/status
HiveMQ Cloud Free (1 credential = all devices)
  ↓ subscribe farm/#
Railway Bridge (Node.js worker, HMAC-signed POST)
  ↓ /api/telemetry/ingest
Vercel Next.js (Supabase service_role)
  ↓ insert sensor_readings, update iot_nodes
Supabase Postgres + RLS
  ↓ read via Supabase JS (user session cookie)
Web (5s polling via sensor_readings_latest cache)
```

**Tables involved:**
- `iot_nodes` — device_uid + hardware_model + is_disabled
- `sensors` — sensor_type + channel per device
- `sensor_readings` — time-series telemetry
- `sensor_readings_latest` — Phase 11 O(1) latest cache
- `device_credentials` — bcrypt hash storage (Section 18.2 + 22.1)
- `device_claim_codes` — QR/token claim flow (Section 22.2)
- `legacy_device_mappings` — 1 prefix → 1 SMF device (Section 21)
- `farms → auth.users` — RLS chain root

---

## 2. HiveMQ Tier Capabilities (verified from HiveMQ docs)

| Capability | Free Serverless | Starter $65/mo | Pro/Enterprise |
|---|---|---|---|
| Create credential via REST API | ❌ Dashboard only | ✅ | ✅ |
| Delete credential via API | ❌ | ✅ | ✅ |
| Rotate credential via API | ❌ | ✅ | ✅ |
| Per-credential ACL | ❌ (all credentials = full access) | ✅ | ✅ |
| Wildcard/pattern permission | ❌ | ✅ | ✅ |
| Max credentials | **5** | 100 | Unlimited |
| Max concurrent sessions | 100 | 1000 | Unlimited |
| Data traffic/month | 10 GB | 100 GB | Unlimited |
| WebSocket support | ✅ | ✅ | ✅ |
| TLS support | ✅ | ✅ | ✅ |

**Verdict:** Free tier = **cannot** support multi-tenant safely. 5-credential cap = max 5 customers. Zero ACL = any credential can subscribe/publish any topic.

---

## 3. Current Security Issues

### 🔴 Critical

1. **`smfiot:Smfiot4556#` leaked in firmware `config.h`** git-tracked → anyone with repo access = broker admin
2. **All devices share 1 credential** → cannot revoke one without breaking all
3. **No broker-level ACL** → any authenticated client subscribe/publish any topic (all future customers exposed)
4. **Bridge worker uses shared credential** → subscribes `farm/#` = ALL data on broker (fine for single-device test, blocker for multi-tenant)

### 🟡 Medium

5. **TLS uses `setInsecure()`** — encrypted but cert not validated → MITM possible on untrusted networks
6. **No HiveMQ client-ID enforcement** — any client can reuse `smf_device_SMF001` and disconnect the real device

### 🟢 Low (already handled)

- Web layer isolation OK (RLS enforced via farms → auth.uid())
- HMAC-signed ingest OK (TELEMETRY_INGEST_SECRET)
- Bridge secrets in Railway env (not in code)

---

## 4. Recommended MQTT Architecture

```
ESP32 (per-device credential: username=device_uid, password=random 32-byte)
  ↓ mqtts://8883 — smf/{customer}/{uid}/*
HiveMQ Starter+ (ACL per-credential = topic-scoped)
  ↓ worker uses wildcard credential smf/+/+/+
Railway Bridge (single worker cred, dual-subscribe: smf/+ AND farm/+ during migration)
  ↓ HMAC POST batched telemetry
Vercel /api/telemetry/ingest
  ↓ resolve customer_identity_id + device_uid from topic path
Supabase (RLS chain: sensor → device → farm → auth.uid())
  ↓ Realtime channel (Phase 12) OR 5s polling (current)
Web dashboard
```

**Key change from current:**
- Per-device credential instead of shared
- Broker ACL enforces topic isolation
- Topic namespace includes customer + device UID

---

## 5. Topic Architecture (Recommended)

```
smf/{customer_identity_id}/{device_uid}/telemetry
smf/{customer_identity_id}/{device_uid}/status
smf/{customer_identity_id}/{device_uid}/command
smf/{customer_identity_id}/{device_uid}/response
smf/{customer_identity_id}/{device_uid}/config
smf/{customer_identity_id}/{device_uid}/relay/{ch}/set
smf/{customer_identity_id}/{device_uid}/relay/{ch}/status
smf/{customer_identity_id}/{device_uid}/event/{type}
```

**Payload = existing legacy schema** (no change):
```json
smf/CUS001/SMF001/telemetry
{"temperature":28.4, "humidity":74, "soil_moisture":45, "battery":87}
```

**Design rationale:**
- 1 telemetry topic รับหลาย sensor ในข้อความเดียว = ลด MQTT overhead
- Payload shape ไม่แก้ = Flutter parser + ESP32 firmware code เดิมยังใช้ได้
- Only topic path changes = firmware constant refactor เท่านั้น

---

## 6. Credential Architecture

### HiveMQ (Starter tier)

| Credential | Purpose | ACL Rules |
|---|---|---|
| Master API token | SMF backend calls REST API (server env only) | Full admin |
| Worker sub credential | Railway bridge subscribes all telemetry | `sub smf/+/+/+` |
| Per-device credential | ESP32 units — 1 per physical device | Pub+sub only own topic path |

### SMF DB (`device_credentials` table)

- bcrypt hash + prefix + last4 (never plaintext stored)
- Rotation tracked via `revoked_at` column
- Partial UNIQUE `(device_id) WHERE revoked_at IS NULL` = one active credential per device

### Server env

```
HIVEMQ_MGMT_API_URL       # server only, never client
HIVEMQ_MGMT_API_TOKEN     # server only, never client
```

**Rule:** No `NEXT_PUBLIC_*` prefix for any MQTT credential. No credential in browser bundle, Flutter build, or ESP32 code repo.

---

## 7. ACL Architecture (HiveMQ Starter Access Management)

### Device credential `SMF-A1B2C3`

```
PUBLISH allowed:
  smf/{customer}/SMF-A1B2C3/telemetry
  smf/{customer}/SMF-A1B2C3/status
  smf/{customer}/SMF-A1B2C3/response
  smf/{customer}/SMF-A1B2C3/relay/+/status
  smf/{customer}/SMF-A1B2C3/event/+

SUBSCRIBE allowed:
  smf/{customer}/SMF-A1B2C3/command
  smf/{customer}/SMF-A1B2C3/config
  smf/{customer}/SMF-A1B2C3/relay/+/set

Everything else: DENIED
```

### Worker credential `smf-worker`

```
SUBSCRIBE:
  smf/+/+/telemetry
  smf/+/+/status
  smf/+/+/response
  smf/+/+/event/+
PUBLISH:
  smf/+/+/command
  smf/+/+/config
  smf/+/+/relay/+/set
```

**Auto-inject customer_id:** HiveMQ Data Hub (Starter tier) can inject `{customer}` from credential metadata → device firmware doesn't need to know customer_id in advance.

---

## 8. Legacy Compatibility Strategy

### Keep working during migration

Bridge subscribes **both** patterns:
- New: `smf/+/+/telemetry`, `smf/+/+/status`, etc.
- Legacy: `farm/temp`, `farm/humidity`, `farm/device/status`

Legacy path resolves via `legacy_device_mappings.legacy_topic_prefix='farm'` → 1 SMF device (SMF001 test unit).

**SMF001 keeps working until firmware reflashed.** New devices flash with new namespace from factory.

### Deprecation timeline

| Phase | Timeline | Action |
|---|---|---|
| A (now) | Immediate | Bridge dual-subscribes new + legacy |
| B | When firmware reflash pipeline ready | New devices ship with `smf/*` topics |
| C | 6 months after Phase B | Deprecate `farm/*` (reflash SMF001) |

---

## 9. Free vs Starter Comparison

| Factor | Free ($0) | Starter ($65/mo) |
|---|---|---|
| Max devices | 5 total | 100 |
| Multi-tenant safe | ❌ (no ACL) | ✅ |
| Automated provisioning | ❌ manual | ✅ REST API |
| Credential rotation | ❌ | ✅ |
| Scalability | Dev only | Beta + early production |
| Cost per device @ 100 | ∞ (breaks at 6) | $0.65/mo/device |
| Break-even | Never (unsafe for real customers) | 1 paying Pro customer |

**Break-even math:**
- Pro plan = ฿499/mo/customer (Phase 1.5)
- Starter tier = $65/mo ≈ ฿2,300/mo
- **1 Pro customer** = tier paid + ฿-1,800 net (need 5 Pro customers to break even purely on MQTT cost)
- Realistic: bundle with base infrastructure (Vercel, Supabase, LINE) → 3-5 paying customers = platform sustainable

---

## 10. Recommended Migration Path

### Phase 1 — Immediate (this week, blocking security)

- [ ] Keep Free tier for SMF001 test only
- [ ] Rotate `smfiot:Smfiot4556#` credential in HiveMQ Dashboard (delete + create new random)
- [ ] Move `MQTT_PASSWORD` firmware constant → `secrets.h` (gitignored)
- [ ] Update Railway bridge env `HIVEMQ_PASS` to new value

### Phase 2 — Before first paying customer

- [ ] Upgrade HiveMQ **Starter** ($65/mo)
- [ ] Generate HiveMQ REST API token → Vercel env vars
- [ ] Implement `lib/hivemq.ts` REST API client
- [ ] Extend `regenerateDeviceCredential` server action to call HiveMQ API
- [ ] Update firmware constants (per-device username = device_uid, per-device password)
- [ ] Reflash all deployed devices with new namespace `smf/{customer}/{uid}/*` — 30 min per unit

### Phase 3 — Multi-device production

- [ ] Firmware auto-fetches config via one-time claim code (QR scan + short-lived token)
- [ ] Bridge scales: single wildcard sub `smf/+/+/+` handles all traffic
- [ ] Monitoring: HiveMQ Dashboard per-credential message rate
- [ ] Rate limiting per device (prevent DoS from misbehaving firmware)

---

## 11. Required Database Changes

### Existing tables reused (no schema change)

- `iot_nodes` — has device_uid + hardware_model + is_disabled
- `device_credentials` — bcrypt hash storage
- `device_claim_codes` — QR/token claim flow
- `legacy_device_mappings` — dual-mode bridge

### Add (optional Phase 2+)

```sql
alter table public.iot_nodes
  add column if not exists mqtt_topic_prefix text;
-- computed as smf/{customer_identity_id}/{device_uid} for bridge fast-lookup

alter table public.device_credentials
  add column if not exists hivemq_credential_id text;
-- HiveMQ internal ID for API delete/rotate
```

---

## 12. Required Backend Changes

### Vercel Web

- `lib/hivemq.ts` (NEW) — REST API client (create/delete/rotate credential + ACL)
- `app/dashboard/devices/[deviceId]/mqtt/actions.ts` (extend) — detect Starter tier + call HiveMQ API automatically
- Env vars: `HIVEMQ_MGMT_API_URL`, `HIVEMQ_MGMT_API_TOKEN`

### Railway Bridge

- Extend subscribe to `smf/+/+/#` alongside `farm/#`
- Parse topic to extract `customer_identity_id + device_uid` — resolve to SMF device via new column OR RPC
- Same HMAC POST contract — no ingest API change

---

## 13. Required Flutter Changes

### Minimum — Manual mode (MODE A) — no code change needed

Existing Settings screen has broker/username/password fields → user pastes values from SMF Web MQTT config page.

### Full — Auto mode (MODE B) — Phase 2+

- Add login screen — Supabase auth via `supabase-flutter` package
- Fetch device config from SMF API `/api/mobile/devices/{id}/config`
- Store per-device credential in Flutter Secure Storage (NOT SharedPreferences)
- Multi-device support — user picks which device app connects to

---

## 14. Estimated Implementation Steps

### If upgrade to Starter (recommended)

| Step | Time |
|---|---|
| HiveMQ tier upgrade + REST API token | 15 min |
| `lib/hivemq.ts` REST client + integration tests | 2 h |
| Extend `regenerateDeviceCredential` to call HiveMQ API | 1 h |
| Bridge dual-subscribe + topic parser | 2 h |
| Firmware constant refactor `secrets.h` + per-device config | 2 h |
| Manual reflash SMF001 with new namespace | 30 min |
| E2E test | 1 h |
| **Total engineering** | **~9 hours** |
| Physical firmware flash | 30 min/device |

### If stay Free tier

- Manual workflow only — 5 device max
- No progression to real customers possible
- **Blocker** — cannot ship to any paying customer

---

## Key Decisions User Must Make Before Phase 4.2 Implementation

1. **HiveMQ tier — Free (test only) หรือ Starter ($65/mo, production)?**
2. **Firmware reflash timeline — เมื่อไหร่พร้อม reflash SMF001 + จะทำอย่างไรกับ ESP32 ที่ deploy ไปแล้วในอนาคต (OTA vs manual USB)?**
3. **Flutter changes — คง Manual (MODE A) หรือ investment ทำ Auto (MODE B)?**

---

## Summary Table

| Layer | Now (Free) | Recommended (Starter) |
|---|---|---|
| Broker | HiveMQ Free | HiveMQ Starter |
| Credential | 1 shared | 1 per device |
| ACL | None | Per-credential topic-scoped |
| Topics | `farm/*` (single-tenant) | `smf/{customer}/{uid}/*` |
| Provisioning | Manual | Automated via REST API |
| Multi-tenant | ❌ Unsafe | ✅ Safe |
| Max devices | 5 | 100 |
| Monthly cost | $0 | $65 |
| Ready for paying customers | ❌ | ✅ |
