# ESP32 Firmware ↔ SMF Web Integration Spec

**Status:** ESP32 firmware source not in Flutter project. This spec describes minimal changes to existing firmware so it works with SMF Web via HiveMQ, while preserving the legacy Flutter App.

## Change 1 — Broker migration (REQUIRED)

Legacy broker: `broker.emqx.io:1883` (public, plaintext)
New broker: HiveMQ Cloud (TLS, per-device auth)

**Firmware changes:**
```cpp
// Before
const char* MQTT_HOST = "broker.emqx.io";
const int   MQTT_PORT = 1883;

// After
const char* MQTT_HOST = "c3a0a4b369d142129741b4e3178a06f7.s1.eu.hivemq.cloud";
const int   MQTT_PORT = 8883;
const char* MQTT_USERNAME = "SMF-A1B2C3D4";       // matches iot_nodes.device_uid + device_credentials.mqtt_username
const char* MQTT_PASSWORD = "<32-byte password>";  // from device_credentials, shown once at generate
const char* MQTT_CA_CERT  = "-----BEGIN CERTIFICATE-----\n..."; // ISRG Root X1 (bundled)
```

Add TLS setup:
```cpp
WiFiClientSecure secureClient;
secureClient.setCACert(MQTT_CA_CERT);
PubSubClient mqtt(secureClient);
mqtt.setServer(MQTT_HOST, MQTT_PORT);
```

Connect with credentials:
```cpp
if (mqtt.connect(clientId, MQTT_USERNAME, MQTT_PASSWORD, ...)) { ... }
```

## Change 2 — Client ID (REQUIRED)

Old: `esp32-{random}` or similar
New: `smf_device_{device_uid}` — matches `iot_nodes.mqtt_client_id` (Phase 9 spec)

```cpp
String clientId = "smf_device_" + String(DEVICE_UID);
```

## Change 3 — LWT (Last Will and Testament) — RECOMMENDED

Automatic offline detection when ESP32 loses power/network.

```cpp
mqtt.connect(clientId, MQTT_USERNAME, MQTT_PASSWORD,
  "farm/device/status",                              // LWT topic
  1,                                                  // QoS
  true,                                               // retain
  "{\"online\":false,\"reason\":\"lwt\"}"            // LWT payload
);
```

## Change 4 — Topic prefix (RECOMMENDED for multi-device)

**Current (single-tenant):** `farm/temp`, `farm/humidity`, `farm/relay/1/status`

**Problem:** Two ESP32s = collision. Both publish `farm/temp` → readings overwrite.

**Option A (recommended for production):** Add device UID prefix
```cpp
// Before
mqtt.publish("farm/temp", "{\"temperature\":28.4}");

// After
String topic = String(DEVICE_UID) + "/farm/temp";
mqtt.publish(topic.c_str(), "{\"temperature\":28.4}");
```

Then update `legacy_device_mappings.legacy_topic_prefix` per device UID.

**Option B (test mode):** Keep `farm/*` for the ONE test unit. Fine for single-device validation.

## Change 5 — Firmware version reporting (RECOMMENDED)

Extend `farm/device/status` payload:
```json
{
  "online": true,
  "rssi": -42,
  "time": "14:03:11",
  "firmware_version": "2.31.0",
  "hardware_model": "SMF-MAIN-V1",
  "mac_address": "24:6F:28:AA:BB:CC"
}
```

Worker maps `firmware_version` → `iot_nodes.firmware_version` (for OTA / dashboard).

## Preserved (no change needed)

**All legacy topics + payloads stay the same:**
- `farm/temp`, `farm/humidity`, `farm/light`, `farm/soil`, `farm/power`
- `farm/relay/{ch}/set`, `farm/relay/{ch}/status`
- `farm/config/schedule|rules|sheets|line`
- `farm/cmd/wifi_reset`, `farm/cmd/restart`

**Payload shape identical** — Flutter App continues to work unchanged after broker migration.

Only difference: both Flutter App AND SMF Web now talk via HiveMQ instead of public `broker.emqx.io`. Flutter user updates broker setting in Settings screen; ESP32 gets reflashed once.

## Provisioning checklist

Per ESP32 unit:

1. Admin adds device in Web → gets `device_uid` (e.g. `SMF-A1B2C3D4`)
2. Admin generates MQTT credential (Phase 9 `generateDeviceCredential()`) → password shown once
3. Admin inserts `legacy_device_mappings(device_id, legacy_topic_prefix)` — prefix = `SMF-A1B2C3D4` if using Option A, `farm` for Option B
4. Firmware source: update `DEVICE_UID`, `MQTT_USERNAME`, `MQTT_PASSWORD` constants
5. Flash ESP32 via USB
6. ESP32 boots → connects HiveMQ over TLS → publishes `farm/device/status` (or `{DEVICE_UID}/farm/device/status`)
7. Worker resolves via `legacy_device_mappings` → SMF device online in dashboard

## Future firmware (Phase 12+)

Consider migrating fully to SMF-native protocol (`smfiot/{uid}/telemetry` batch payload) once Flutter App is retired or refactored. Legacy adapter code becomes dead code — can be removed.
