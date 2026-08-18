# SMF Web vs Legacy Flutter App — MQTT Gap Analysis

## Comparison Table

| Item | Legacy Flutter App | SMF Web (Phase 9) | Gap | Action |
|---|---|---|---|---|
| Broker | `broker.emqx.io:1883` (public, no auth) | HiveMQ Cloud Free `c3a0a4b369d142129741b4e3178a06f7.s1.eu.hivemq.cloud:8883` (TLS + auth) | Different broker | Migrate ESP32 to HiveMQ **or** run bridge |
| TLS | disabled (`use_tls: false`) | required (8883) | Legacy insecure | ESP32 firmware must add TLS + CA cert |
| Auth | none | per-device username/password (bcrypt hash in `device_credentials`) | Legacy uses public broker | Provision credential + flash to ESP32 |
| Topic namespace | `farm/*` — single-tenant | `smfiot/{device_uid}/*` — multi-tenant | **Collision if 2 ESP32s use legacy topics** | Adapter maps 1 legacy → 1 SMF device (test mode only) OR firmware update |
| Device identity | none (topics fixed) | `device_uid` (Phase 4) | Legacy has no UID | New `legacy_device_mappings` table required |
| Client ID | `smartfarm_app_{random}` | `smf_device_{device_uid}` (Phase 9) | App-side vs device-side | Not relevant — different sources |
| Telemetry topic | `farm/temp`, `farm/humidity`, `farm/light`, `farm/soil`, `farm/power` (5 topics, 1 field each) | `smfiot/{uid}/telemetry` (batch payload, N readings) | Different granularity | Adapter fans-in 5 topics → 1 batch |
| Telemetry payload | `{"temperature": 28.4}` per topic | `{"device_uid":"...","occurred_at":"...","readings":[{sensor_type,value}...]}` | Different shape | Adapter transforms |
| Status | `farm/device/status` `{"online":true,"rssi":-42,"time":"14:03:11"}` | `smfiot/{uid}/status` with `{status,firmware_version,timestamp}` | Field mapping differs | Adapter maps `online→status`, ignores `rssi/time` (or extend `iot_nodes` columns) |
| Relay control | `farm/relay/{ch}/set` `{"state":true}` — App publishes directly | `smfiot/{uid}/command` `{command_id,command:"relay_on",payload:{channel}}` | Different topic + semantics | Adapter subscribes SMF commands + rewrites to legacy topic per test device |
| Relay confirmation | `farm/relay/{ch}/status` `{"state":true}` | inside `device_commands.status` state machine + optional `smfiot/{uid}/response` | Different completion signal | Adapter maps legacy status → SMF command ack |
| QoS | 1 (at-least-once) | 1 (recommended) | Same | No action |
| Retain | Config topics retained (Flutter) | Status retained (Phase 9 spec) | Compatible | No action |
| Offline detection | 25s watchdog on `farm/device/status` | worker cron (deferred to Phase 10.2) | Web has no watchdog yet | Add worker heartbeat check |
| Firmware version | not published in known topics | reported via `status` payload | Legacy silent | Extend legacy firmware later, or ignore |
| LINE integration | ESP32 sends LINE directly via config | LINE via SMF backend `lib/line.ts` | Duplicate paths | Decision: LINE from ESP32 (existing) OR from SMF (new). Keep existing for legacy tests |
| Config push | `farm/config/schedule|rules|sheets|line` (retained JSON) | SMF `device_configs` table + `smfiot/{uid}/config` topic | Different topic + no schedule/rule concept in SMF DB yet | Skip for legacy adapter phase — schedule/rules stay on ESP32 |

## Critical Gaps (must resolve before ESP32 test)

**G1 — Broker mismatch** — legacy ESP32 talks to `broker.emqx.io`, SMF Web talks to HiveMQ. **Cannot bridge without firmware change or MQTT bridge broker.**

**Options:**
- **A. Reflash ESP32** to point at HiveMQ (TLS + credentials) — 1-time change, cleanest
- **B. Run local MQTT bridge** (Mosquitto with bridge mode) `broker.emqx.io` ↔ `HiveMQ` — no firmware change but adds infra
- **C. Temporary migration** — change Flutter App broker setting → HiveMQ, keep ESP32 on `broker.emqx.io`, add a second app-side bridge (won't work — ESP32 can't reach HiveMQ)

**Recommended: A**. Reflash ESP32 once with HiveMQ credentials. Then legacy topic pattern still works — just different broker.

**G2 — Topic namespace collision** — `farm/temp` is not device-scoped. If 2 ESP32s connect, they overwrite each other.

**Options:**
- **A. Firmware adds device prefix** — change firmware topic `farm/temp` → `smfiot/{device_uid}/farm/temp`. Web adapter subscribes `smfiot/+/farm/temp`
- **B. Test mode single device** — accept 1 ESP32 per broker for now, hard-code mapping. Fine for `TEST-ESP32-001` unit test
- **C. HiveMQ topic prefix per device via credential** — each device authenticates as `smf_device_{uid}` and Sensor topics get auto-prefixed. Requires HiveMQ Data Hub (Starter+ tier)

**Recommended: B for immediate test, A for production**.

**G3 — Device identity mapping** — legacy has no UID. SMF needs to know which SMF device row = which physical ESP32.

**Solution:** new `legacy_device_mappings` table:
```sql
create table legacy_device_mappings (
  id uuid primary key default gen_random_uuid(),
  device_id uuid unique not null references iot_nodes(id) on delete cascade,
  legacy_topic_prefix text not null default 'farm',  -- allows future per-device prefix
  legacy_client_id text,                              -- optional ESP32 MAC/chip ID for correlation
  mac_address text,
  created_at timestamptz default now()
);
create unique index on legacy_device_mappings(legacy_topic_prefix);  -- 1 mapping per prefix
```

Admin sets mapping when adding first legacy device — Web knows `farm/temp` → this SMF device.

## Non-critical differences (safe to ignore for test)

- Config push topics (schedule/rules/LINE/sheets) — leave on ESP32, don't sync to SMF DB in this test phase
- Google Sheets logging — legacy feature, SMF doesn't need
- Sensor field names — `n/p/k` vs `nitrogen/phosphorus/potassium` — adapter aliases

## Payload transformation table (adapter contract)

| Legacy in | SMF out (batch entry in `readings[]`) |
|---|---|
| `farm/temp {"temperature":28.4}` | `{sensor_type:"temperature", value:28.4, unit:"°C"}` |
| `farm/humidity {"humidity":74.3}` | `{sensor_type:"humidity", value:74.3, unit:"%"}` |
| `farm/light {"lux":532.0}` | `{sensor_type:"light", value:532.0, unit:"lux"}` |
| `farm/soil {"ph":6.5,...}` | 5 entries: `ph`, `ec`, `npk` (composite? or 3 sensors), `moisture` |
| `farm/power {"v":230,"a":1.2,"w":276}` | 3 entries: `voltage`, `current`, `power` (need new sensor_type additions in `lib/sensor-types.ts`) |
| `farm/device/status {"online":true}` | update `iot_nodes.status='online'` + `last_seen=now()` |
| `farm/relay/1/status {"state":true}` | update matching `device_commands` row to `status='acknowledged'` + emit `device_events(relay_changed)` |

**Sensor type gaps in current SMF catalog:**
- `voltage`, `current`, `power` — **not in `SENSOR_TYPES`** ([lib/sensor-types.ts](../../lib/sensor-types.ts))
- Must extend before ingestion works. Add: `voltage`, `current`, `power`.
