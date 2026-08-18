# ESP32 Firmware — Verified Analysis

**Source:** `D:\ArduinoProjects\ESP32 S3 N16R8\firmware\main_board\` — Smart Farm IoT v2 (PlatformIO project)

All findings from actual firmware source code — byte-level verified.

## 1. Hardware

| Component | Interface | Purpose |
|---|---|---|
| ESP32-S3 N16R8 (16MB flash, 8MB Octal PSRAM) | — | MCU |
| DHT22 | GPIO 4 | Air temp + humidity |
| BH1750FVI | I2C @ 0x23 (SDA=1, SCL=2) | Light (lux) |
| RS485 5-in-1 soil probe | UART RX=16, TX=17, DE/RE=18 @ 4800 baud, Modbus RTU slave 1 | pH, EC, N, P, K |
| FC-28 analog moisture | ADC1 GPIO 6, power gate GPIO 7 | Soil moisture % (optional) |
| INA226 power monitor | I2C @ 0x40, 0.1Ω shunt, 3A max | Voltage/current/power |
| 4-channel relay (active LOW) | GPIO 8, 9, 10, 11 | Actuators (pump/fan/etc) |

## 2. MQTT Configuration (`config.h`)

```cpp
#define MQTT_HOST           "c3a0a4b369d142129741b4e3178a06f7.s1.eu.hivemq.cloud"
#define MQTT_PORT           8883
#define MQTT_USER           "smfiot"
#define MQTT_PASSWORD       "<REDACTED>"           // ⚠ SECURITY ISSUE — see below
#define MQTT_CLIENT_PREFIX  "smartfarm_esp32_"
#define MQTT_BUFFER_SIZE    1024
```

**Client ID at runtime:** `smartfarm_esp32_{ESP.getEfuseMac hex}` — unique per chip (MAC-derived)

**TLS:** `wifiClient.setInsecure()` — encrypted, **cert NOT verified** (MITM possible on hostile networks)

**Timeouts:** socket 15s, keepalive 60s

## 3. ⚠ CRITICAL SECURITY ISSUES

| # | Severity | Issue | Fix |
|---|---|---|---|
| 1 | 🔴 CRITICAL | **MQTT credentials `smfiot:<REDACTED>` hardcoded in `config.h`** — in git history, world-readable if repo shared | **Rotate credential in HiveMQ Dashboard immediately**. Regenerate + reflash all ESP32s. Move plaintext to build-time secret (PlatformIO env / `secrets.h` in gitignore) |
| 2 | 🔴 CRITICAL | **Single shared credential across all devices** — one compromised device = all devices compromised. Zero per-device isolation | Generate per-device credential using `lib/device-auth.ts` (Phase 9). Flash unique password per unit. HiveMQ Access Management allows this |
| 3 | 🟡 HIGH | `setInsecure()` — TLS without cert validation | Bundle ISRG Root X1 (or HiveMQ CA), call `setCACert()` instead. ~2KB flash cost |
| 4 | 🟡 HIGH | Topics `farm/*` are single-tenant — 2 ESP32s on same broker collide (both publish `farm/temp`, latter overwrites former) | Add device UID prefix per unit (see Section 6) |
| 5 | 🟢 LOW | Default QoS 0 (`client.publish(topic, payload)`) — at most once, losses possible | Change to QoS 1 for status/relay control |

## 4. MQTT Topics (verified from `mqtt_topics.h` + `mqtt_handler.cpp`)

**Byte-identical to Flutter App `mqtt_topics.dart`** — comment in both files: "MUST stay identical"

**ESP32 → Broker (publish):**
| Topic | Function | Interval | QoS | Retain |
|---|---|---|---|---|
| `farm/device/status` | Heartbeat | 10s | 0 | no |
| `farm/temp` | Air temperature | 5s | 0 | no |
| `farm/humidity` | Air humidity | 5s | 0 | no |
| `farm/light` | Light lux | 5s | 0 | no |
| `farm/soil` | Soil pH/EC/NPK/moisture | 10s | 0 | no |
| `farm/power` | INA226 V/A/W | 5s | 0 | no |
| `farm/relay/{1..4}/status` | Relay confirmed state | On-change | 0 | no |
| `farm/config/schedule/status` | Echo stored schedule | On reconnect | 0 | no |
| `farm/config/rules/status` | Echo stored rules | On reconnect | 0 | no |
| `farm/config/sheets/status` | Echo stored sheets | On reconnect | 0 | no |
| `farm/config/line/status` | Echo stored LINE | On reconnect | 0 | no |

**Broker → ESP32 (subscribe):**
| Topic | Action |
|---|---|
| `farm/relay/+/set` | Set relay channel |
| `farm/config/schedule` | Load schedule (retained JSON → persist NVS) |
| `farm/config/rules` | Load automation rules |
| `farm/config/sheets` | Load Google Sheets config |
| `farm/config/line` | Load LINE Messaging config |
| `farm/cmd/wifi_reset` | Forget WiFi + reboot to captive portal |
| `farm/cmd/restart` | Soft reset (keep WiFi) |

## 5. Payload Formats (verified from `mqtt_handler.cpp` publish functions)

**Air readings** — `publishAir()` lines 202-218:
```json
// farm/temp
{"temperature": 28.4}    // %.1f — 1 decimal

// farm/humidity
{"humidity": 74.3}       // %.1f

// farm/light
{"lux": 532.0}           // %.1f
```

**Soil** — `publishSoil()` lines 220-242 (ArduinoJson):
```json
{"ph": 6.5, "ec": 420, "n": 45, "p": 22, "k": 68}
// optional moisture (from FC-28 or 7-in-1 probe):
{"ph": 6.5, ..., "moisture": 38.2}
```
- `ph` rounded 1 decimal, `ec` rounded to integer, `moisture` 1 decimal
- Publishes if EITHER RS485 OR FC-28 has data (won't stay silent when only one wired)

**Power** — `publishPower()` lines 244-256:
```json
{"v": 230.55, "a": 1.234, "w": 276.66}
// v = bus voltage V (2 decimals)
// a = current A (3 decimals)
// w = power W (2 decimals)
```

**Device status** — `publishDeviceStatus()` lines 267-274:
```json
{"online": true, "rssi": -42, "time": "14:03:11"}
```
- `time` = ESP32's NTP wall clock (HH:MM:SS)

**Relay status** — `publishRelayStatus()` lines 258-265:
```json
// farm/relay/1/status
{"state": true}   // or false
```

**All 100% match Flutter models** — no adapter transformation risk on payload level.

## 6. Firmware Version

**Not present in any published payload.** No `firmware_version` field in `publishDeviceStatus()`. Only versioning is inline comments (`v2.30`, `v2.31`).

**Recommended addition to `publishDeviceStatus()`:**
```cpp
snprintf(buf, sizeof(buf),
  "{\"online\":true,\"rssi\":%d,\"time\":\"%s\",\"fw\":\"%s\",\"mac\":\"%s\"}",
  WifiManager::rssi(),
  Automation::currentTimeString().c_str(),
  FIRMWARE_VERSION,          // add #define FIRMWARE_VERSION "2.31" in config.h
  WiFi.macAddress().c_str());
```
Web adapter maps `fw` → `iot_nodes.firmware_version`, `mac` → `legacy_device_mappings.mac_address`.

## 7. Automation on ESP32 (autonomous)

Firmware runs these features **independently of Web/App**:
- Schedule (cron-like time triggers) — `automation.cpp`
- Rules (sensor threshold triggers) — `automation.cpp`
- LINE notifications (direct HTTP POST to LINE Messaging API) — `line_notifier.cpp`
- Google Sheets upload — `sheets_uploader.cpp`

**Config pushed via retained MQTT:**
- App/Web publishes `farm/config/{schedule|rules|sheets|line}` with `retain=true`
- ESP32 persists to NVS on receive → survives reboot
- ESP32 echoes back to `.../status` topic → App/Web confirms what's stored

**Implication for SMF Web:**
- SMF automation engine (Phase 10) is DUPLICATE work for legacy ESP32 — device handles its own rules
- Two integration modes for automation:
  - **A. Config passthrough** — SMF Web serializes rules to legacy JSON, publishes to `farm/config/rules` (retained). ESP32 handles execution. Requires backend to know legacy schema
  - **B. Ignore for legacy, use SMF rules only for new devices** — legacy keeps its own on-device rules, SMF just monitors telemetry

Recommend **B** — don't fight the firmware. Legacy device = legacy behavior. SMF Web shows readings + relay state, doesn't manage rules for legacy units.

## 8. Reconnect Logic

- `reconnect()` guarded by 5s cooldown between attempts
- Auto-publish on reconnect: device status + all relay states + stored config echoes
- LINE "device online" ping sent once per power cycle (not per reconnect — avoids spam on flaky broker)

## 9. Message Handler (`onMessage`)

- Buffer non-terminated → copy to `char[MQTT_BUFFER_SIZE]` first
- Handles config topics (delegate to Automation/Sheets/Line/Wifi modules)
- Handles cmd/* (wifi_reset, restart)
- Handles `farm/relay/N/set` — parses `{"state":bool}`, calls `RelayControl::set()`, echoes `farm/relay/N/status`

**Publishes back after relay set** — Web receives ack via same topic. Matches Flutter's optimistic-UI + reconciliation pattern.

## 10. Board Info for SMF integration

Populate `iot_nodes` for each unit:
- `hardware_model` = `"SMF-MAIN-V1"` (ESP32-S3 N16R8 + DHT22 + BH1750 + RS485 + INA226 + 4-relay)
- `hardware_version` = board revision if tracked
- `firmware_version` = `"2.31"` (or whatever current — populate manually until firmware publishes it)

Populate `legacy_device_mappings`:
- `mac_address` = ESP32 MAC (get from `WiFi.macAddress()` or firmware serial log)
- `chip_id` = same as MAC prefix or `ESP.getEfuseMac()` hex — used in client ID

## 11. Sensor Provisioning per Device

For each ESP32 unit added to SMF:
```sql
-- 1. Add device
INSERT INTO iot_nodes (device_uid, device_name, farm_id, hardware_model, firmware_version)
VALUES ('SMF-A1B2C3D4', 'Greenhouse Main', '<farm_uuid>', 'SMF-MAIN-V1', '2.31');

-- 2. Add expected sensors matching hardware
INSERT INTO sensors (device_id, name, sensor_type, unit) VALUES
  ('<device_uuid>', 'Air Temperature',  'temperature',   '°C'),
  ('<device_uuid>', 'Air Humidity',     'humidity',      '%'),
  ('<device_uuid>', 'Light',            'light',         'lux'),
  ('<device_uuid>', 'Soil pH',          'ph',            'pH'),
  ('<device_uuid>', 'Soil EC',          'ec',            'µS/cm'),
  ('<device_uuid>', 'Soil NPK',         'npk',           'mg/kg'),  -- composite (N+P+K in metadata? or split 3 sensors)
  ('<device_uuid>', 'Soil Moisture',    'soil_moisture', '%'),      -- only if FC-28 wired
  ('<device_uuid>', 'Voltage',          'voltage',       'V'),
  ('<device_uuid>', 'Current',          'current',       'A'),
  ('<device_uuid>', 'Power',            'power',         'W');

-- 3. Map legacy topic
INSERT INTO legacy_device_mappings (device_id, legacy_topic_prefix, mac_address, notes)
VALUES ('<device_uuid>', 'farm', '<esp32_mac>', 'Unit deployed at Greenhouse Main');
```

## 12. What Does NOT Need to Change

Everything works today as long as:
- Web adapter (in worker) subscribes `farm/#` on same HiveMQ
- `legacy_device_mappings` row exists for the ONE ESP32 currently deployed
- Test mode = single device (Option B from earlier gap analysis)

**No reflash needed** for immediate telemetry integration. Only reflash when:
- Rotating leaked credential (should be soon)
- Adding per-device isolation
- Adding firmware_version to status payload
- Multi-device deployment (add device UID prefix to topics)
