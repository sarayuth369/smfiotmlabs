# Real ESP32 → SMF Web End-to-End Test Plan

## Preconditions

- [ ] SUPABASE Section 21 SQL run (`legacy_device_mappings` + sensor_type expansion)
- [ ] HiveMQ Cloud cluster active (Free tier ok — `c3a0a4b369d142129741b4e3178a06f7.s1.eu.hivemq.cloud:8883`)
- [ ] HiveMQ credentials created: 1 worker credential + 1 per-device credential
- [ ] MQTT Worker deployed (Railway/Render — separate repo, does NOT exist in smfiotmlabs yet)
- [ ] ESP32 firmware source available for reflash
- [ ] Web deployed on Vercel with `TELEMETRY_INGEST_SECRET` env

## Setup

### 1. Create SMF device in Web

- Login → Dashboard → เพิ่มฟาร์ม (skip if farm exists)
- Farm → เพิ่มอุปกรณ์ → name `TEST-ESP32-001`, get generated `device_uid` (e.g. `SMF-A1B2C3D4`)
- Add sensors to device:
  - `temperature` (channel: null)
  - `humidity` (channel: null)
  - `light` (channel: null)
  - `ph`, `ec`, `soil_moisture` (channel: null) — for soil topic
  - `voltage`, `current`, `power` (channel: null) — for power topic

### 2. Register legacy mapping

Supabase SQL Editor:
```sql
insert into public.legacy_device_mappings (device_id, legacy_topic_prefix, mac_address, notes)
values (
  'YOUR_DEVICE_UUID_FROM_STEP_1',
  'farm',                            -- Option B: single test device
  '24:6F:28:AA:BB:CC',               -- your ESP32 MAC
  'Test unit #1'
);
```

### 3. Provision MQTT credential

In HiveMQ Cloud → Access Management → Create Credential:
- Username: `SMF-A1B2C3D4` (device_uid)
- Password: random 32 chars (copy — shown once)
- Permissions: publish/subscribe `farm/#` (for now — tighten to per-device topic when firmware adds prefix)

Store hashed password:
```sql
-- run in Supabase SQL Editor, replace values
insert into public.device_credentials (device_id, mqtt_username, mqtt_password_hash, mqtt_password_prefix)
values (
  'YOUR_DEVICE_UUID',
  'SMF-A1B2C3D4',
  '<bcrypt hash of the password you set in HiveMQ>',
  '<first 4 chars>'
);
```
Or use server action `regenerateDeviceCredential(deviceId)` (not yet implemented — TODO Phase 12 UI).

### 4. ESP32 firmware (verified — no reflash needed for basic test)

Firmware **already configured for HiveMQ** — see [esp32-firmware-analysis.md](esp32-firmware-analysis.md).

- MQTT_HOST already = HiveMQ cluster
- MQTT_PORT = 8883 (TLS)
- Credential `smfiot:Smfiot4556#` currently shared across all devices — works for single-device test

**Just power on the ESP32.** It connects to HiveMQ, publishes `farm/*` topics with existing credential. Worker sees messages via same broker.

**Reflash needed ONLY for:**
- Rotating leaked credential (recommended before production)
- Per-device credentials (multi-device deployment)
- Adding firmware_version to status payload
- Adding device UID prefix to topics (multi-device)

### 5. Verify Flutter App still works (regression)

- Open Flutter app → Settings → change broker to HiveMQ (same host/port/username/password ESP32 uses, OR create separate app credential)
- Confirm live readings still visible in Flutter dashboard
- **If Flutter App uses same credential as ESP32** — HiveMQ may reject duplicate client ID. Use separate credential for app.

## Test Cases

### TEST 1 — ESP32 connects
- Expected: ESP32 serial log shows `MQTT connected`, HiveMQ Dashboard → Clients shows `smf_device_SMF-A1B2C3D4` online
- Verify: `SELECT status, last_seen FROM iot_nodes WHERE device_uid='SMF-A1B2C3D4';`
- Pass: `status='online'`, `last_seen` within last 30s (once worker running)

### TEST 2 — Temperature ingestion
- ESP32 publishes `farm/temp {"temperature":28.5}` (every 10s per firmware)
- Worker log: `resolve_legacy_device` returns SMF device, sensor_readings insert
- Verify: `SELECT * FROM sensor_readings WHERE device_id='...' ORDER BY occurred_at DESC LIMIT 5;`
- Pass: rows exist with `value=28.5`, sensor_id matches temperature sensor

### TEST 3 — Latest cache updated
- After TEST 2
- Verify: `SELECT * FROM sensor_readings_latest WHERE device_id='...';`
- Pass: 1 row per sensor with latest value

### TEST 4 — Soil batch (5 fields from 1 message)
- ESP32 publishes `farm/soil {"ph":6.5,"ec":420,"n":45,"p":22,"k":68,"moisture":38.2}`
- Adapter must produce 4 readings (ph, ec, npk_composite_or_split, moisture)
- Verify: 3-4 rows in sensor_readings with matching sensor_types
- Pass: all sensor types present, values match

### TEST 5 — Device offline (LWT)
- Unplug ESP32
- Expected: HiveMQ sends LWT `farm/device/status {"online":false,"reason":"lwt"}` after keepalive expires (~30s)
- Verify: `iot_nodes.status='offline'`, `device_events` has `disconnected` row
- Pass: reflect in <60s

### TEST 6 — Device reconnect
- Power ESP32 back
- Expected: `farm/device/status {"online":true,...}` → status back to online
- Pass: `iot_nodes.status='online'`, `last_seen` updated

### TEST 7 — Relay command (Web → ESP32)
- Web: POST `/api/devices/{device_id}/command` `{command:"relay_on", payload:{channel:1}}`
- Worker: reads `device_commands` new row, publishes `farm/relay/1/set {"state":true}` to legacy topic
- ESP32: switches relay 1, publishes `farm/relay/1/status {"state":true}`
- Worker: matches ack → updates `device_commands.status='acknowledged'`
- Verify: `SELECT * FROM device_commands ORDER BY requested_at DESC LIMIT 1;`
- Pass: status='acknowledged', ack_at set

### TEST 8 — Unknown topic (safety)
- Send random topic (e.g. `farm/unknown`) via MQTT tool
- Expected: worker logs "ignored" — no DB write
- Pass: no new rows in sensor_readings, no crash

### TEST 9 — Unknown device (safety)
- Publish `otherfarm/temp {"temperature":30}` (different prefix, no mapping)
- Expected: `resolve_legacy_device` returns empty → worker skips
- Pass: no writes, no crash

### TEST 10 — RLS (User A vs User B)
- User B logs in, visits `/dashboard/devices/{User_A_device_id}` via direct URL
- Expected: 404 or empty (RLS blocks read)
- Pass: no data leaked

### TEST 11 — Rate limit / flood protection (deferred)
- ESP32 spams 100 msgs/sec on `farm/temp`
- Expected: ingest keeps up OR worker rate-limits gracefully
- Note: not yet implemented — see Phase 12 backlog

### TEST 12 — MQTT credentials not in browser bundle
- Web build → grep bundle for `HIVEMQ_WORKER_PASSWORD` or MQTT plaintext
- Pass: zero matches (server-only env var)

## Manual test with MQTT tool (no ESP32 needed)

Install MQTTX or use `mosquitto_pub`:

```bash
# Publish fake temp reading (requires HiveMQ credential + TLS)
mosquitto_pub -h c3a0a4b369d142129741b4e3178a06f7.s1.eu.hivemq.cloud -p 8883 \
  --cafile isrg-root-x1.pem \
  -u SMF-A1B2C3D4 -P '<password>' \
  -t 'farm/temp' -m '{"temperature":29.3}'
```

Then check Supabase for insert.

## What CAN NOT be tested from this session

- Actual MQTT worker execution (worker not in this repo — separate deploy)
- Real ESP32 (physical hardware)
- HiveMQ cluster access (needs your credentials)

**To complete testing, you must:**
1. Build & deploy MQTT worker (separate Node.js service, subscribe HiveMQ, POST to `/api/telemetry/ingest`)
2. Reflash physical ESP32
3. Run test cases above

**Session deliverable:** DB schema + adapter contract + payload mapping. Runtime = your side.

## Known limitations

- **Single test device only** (Option B) until firmware adds device UID prefix
- **Config topics ignored** (schedule/rules/sheets/line) — legacy ESP32 handles internally
- **RSSI not stored** — could be added as sensor_type='rssi' if desired
- **Firmware version not reported** in current legacy status payload — spec change needed on firmware side
- **No worker deployed** — biggest blocker to end-to-end validation
