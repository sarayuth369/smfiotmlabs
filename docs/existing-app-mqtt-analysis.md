# Existing Flutter App — MQTT Audit

**Source:** `D:\FlutterProjects\iot_1\` — "Smart Farm IoT v2"

All findings verified against source code — no assumptions.

## 1. Broker (defaults, user-configurable via Settings)

| Field | Value | Source |
|---|---|---|
| Host | `broker.emqx.io` | [app_config.dart:18](../../FlutterProjects/iot_1/lib/core/config/app_config.dart) |
| Port | `1883` | app_config.dart:19 |
| TLS | `false` | app_config.dart:20 |
| Username | `''` (empty) | app_config.dart:21 |
| Password | `''` (empty) | app_config.dart:22 |
| KeepAlive | `20 s` | app_config.dart:26 |
| Reconnect delay | `5 s` | app_config.dart:27 |
| Auto-reconnect | `true` (client-level) | mqtt_service.dart:85 |

**Note:** `broker.emqx.io` = public broker. Comment in source acknowledges this is bring-up only, not production. User can override via Settings → Broker screen (persisted to SharedPreferences via `SettingsService`).

## 2. Client ID

- Format: `smartfarm_app_{random 0-999999}` (mqtt_service.dart:79)
- Random each connect — different ID every session

## 3. Topics (verified from `mqtt_topics.dart`)

**ESP32 → App (subscribe):**
| Topic | Purpose |
|---|---|
| `farm/device/status` | Device heartbeat (every ~10s) |
| `farm/temp` | Temperature reading |
| `farm/humidity` | Humidity reading |
| `farm/light` | Lux reading |
| `farm/soil` | Soil pH/EC/NPK/moisture |
| `farm/power` | Voltage/current/power |
| `farm/relay/{1..4}/status` | Relay confirmed state (echo after switch) |
| `farm/config/schedule/status` | ESP32 echoes stored schedule |
| `farm/config/rules/status` | ESP32 echoes stored automation rules |
| `farm/config/sheets/status` | ESP32 echoes stored Google Sheets config |
| `farm/config/line/status` | ESP32 echoes stored LINE config |

**App → ESP32 (publish):**
| Topic | Purpose | Retain |
|---|---|---|
| `farm/relay/{1..4}/set` | Set relay state | no |
| `farm/config/schedule` | Push schedule to ESP32 (persisted in NVS) | yes (retained) |
| `farm/config/rules` | Push automation rules | yes |
| `farm/config/sheets` | Push Google Sheets config | yes |
| `farm/config/line` | Push LINE token config | yes |
| `farm/cmd/wifi_reset` | Reset WiFi credentials (one-shot) | no |
| `farm/cmd/restart` | Reboot ESP32 (one-shot) | no |

**Subscriptions on connect** — [mqtt_topics.dart:45](../../FlutterProjects/iot_1/lib/core/constants/mqtt_topics.dart) — 15 topics, QoS 1 (`atLeastOnce`)

## 4. Payload Formats (verified from model source)

**`farm/temp`** — [sensor_model.dart:49-58](../../FlutterProjects/iot_1/lib/models/sensor_model.dart)
```json
{"temperature": 28.4}
```

**`farm/humidity`**
```json
{"humidity": 74.3}
```

**`farm/light`**
```json
{"lux": 532.0}
```

**`farm/soil`** — [soil_model.dart:67-79](../../FlutterProjects/iot_1/lib/models/soil_model.dart)
```json
{"ph": 6.5, "ec": 420, "n": 45, "p": 22, "k": 68}
```
Optional `"moisture": 38.2` (only when firmware compiled with `SOIL_HAS_MOISTURE`)

**`farm/power`** — [power_reading_model.dart:31-38](../../FlutterProjects/iot_1/lib/models/power_reading_model.dart)
```json
{"v": 230.5, "a": 1.2, "w": 276.6}
```

**`farm/device/status`** — [device_status_model.dart:51-61](../../FlutterProjects/iot_1/lib/models/device_status_model.dart)
```json
{"online": true, "rssi": -42, "time": "14:03:11"}
```

**`farm/relay/{ch}/status`** and **`farm/relay/{ch}/set`** — [relay_provider.dart:31,49](../../FlutterProjects/iot_1/lib/providers/relay_provider.dart)
```json
{"state": true}
```

**Config topics** — JSON arrays, wrapped by app as `{"items": [...]}` for stream consumers (mqtt_service.dart:147)

## 5. Device Identity — **CRITICAL FINDING**

**Flutter App has no device identity.** Topics are hardcoded `farm/*` with **no device UID prefix**. Firmware assumes **one ESP32 per broker + topic namespace**.

This is **single-tenant by design**. Cannot host multiple ESP32s on the same broker without collision — every device publishing `farm/temp` overwrites every other device's reading.

**Implication for SMF Web (multi-tenant SaaS):** cannot subscribe to `farm/temp` and route to correct customer — need one of:
1. Change ESP32 firmware to add device prefix (e.g., `smfiot/{uid}/farm/temp`)
2. Give each customer their own broker instance (expensive)
3. Give each device unique broker username + use HiveMQ ACL for isolation (feasible on Starter+ tier)

## 6. Online/Offline Detection

- App uses **watchdog timer** on `farm/device/status` — if no message for `25 s`, mark ESP32 offline (device_provider.dart:68, app_config.dart:36)
- ESP32 publishes status every 10s → 25s = 2 missed heartbeats + margin
- If MQTT broker disconnects → immediately mark device offline + clear cached values

## 7. Reconnect Logic

- Auto-reconnect built into `mqtt_client` package (mqtt_service.dart:85)
- Manual disconnect flag prevents auto-reconnect when user disconnects
- On disconnect: cancel watchdog, clear status, schedule reconnect in 5s (`_scheduleReconnect`)

## 8. Local Storage

- `SharedPreferences` via `SettingsService` — broker config + LINE config + Sheets config
- `SQLite` via `DatabaseService` — sensor history (max 20000 rows, log interval 1 min)
- Config topics use MQTT retained — ESP32 gets last-known on reconnect

## 9. LINE Notification

- Config stored via `farm/config/line` (retained) — token pushed to ESP32
- **ESP32 sends LINE messages directly** (based on rules stored in device NVS)
- App only configures, does not send LINE messages itself
- `line_test_service.dart` — test message via LINE Messaging API from app

## 10. ESP32 Firmware Source

- **FOUND** at `D:\ArduinoProjects\ESP32 S3 N16R8\firmware\main_board\` (PlatformIO)
- Full verified analysis: [esp32-firmware-analysis.md](esp32-firmware-analysis.md)
- **Firmware ALREADY on HiveMQ** — broker migration done
- **Payload formats byte-identical** to Flutter models (Flutter comments say "MUST stay identical to firmware")
- Firmware version reporting: not currently in `publishDeviceStatus()` payload — recommend adding

## 11. Publish behavior

- `publishJson(topic, obj, retain=false)` — [mqtt_service.dart:182](../../FlutterProjects/iot_1/lib/services/mqtt_service.dart) — JSON encode + QoS 1
- `publishRaw(topic, string, retain=false)` — [mqtt_service.dart:202] — for command tokens (`wifi_reset`)
- Silently skips publish when not connected (no queueing)

## 12. Provider Wiring Summary

- `SensorProvider` — listens to messageStream, routes by topic to appropriate model
- `DeviceProvider` — tracks MQTT state + heartbeat watchdog + device online flag
- `RelayProvider` — 4 channels, optimistic UI + reconciled on `farm/relay/{ch}/status`
- All providers subscribe to `MqttService.instance.messageStream` (Dart Stream — no Provider/Widget coupling)
