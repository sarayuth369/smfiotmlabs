# ESP32 Firmware ↔ SMF Web Integration Spec

**Status:** Firmware source located at `D:\ArduinoProjects\ESP32 S3 N16R8\firmware\main_board\` — see [esp32-firmware-analysis.md](esp32-firmware-analysis.md) for verified findings.

**Key finding:** Firmware **ALREADY on HiveMQ**. Broker migration = done. Below describes RECOMMENDED (not required) firmware improvements before production.

## Change 1 — Broker migration ✅ DONE

Firmware already uses HiveMQ TLS (verified in `config.h`):
```cpp
#define MQTT_HOST     "c3a0a4b369d142129741b4e3178a06f7.s1.eu.hivemq.cloud"
#define MQTT_PORT     8883
#define MQTT_USER     "smfiot"          // ⚠ hardcoded + shared — see Change 1a
#define MQTT_PASSWORD "Smfiot4556#"     // ⚠ leaked in git — rotate!
```

TLS via `WiFiClientSecure::setInsecure()` — encrypted but cert not validated. Upgrade to `setCACert()` recommended (Change 1b).

## Change 1a — Rotate leaked credential (CRITICAL, DO NOW)

`smfiot:Smfiot4556#` is in `config.h` git-tracked. Anyone with repo access has broker admin.

Steps:
1. HiveMQ Dashboard → Access Management → delete `smfiot` credential
2. Create new credential (or better: per-device credentials — see Change 1c)
3. Update firmware `config.h` with new values
4. Move `MQTT_USER` + `MQTT_PASSWORD` to `secrets.h` (gitignore) or PlatformIO env
5. Reflash all deployed ESP32s

## Change 1b — TLS cert validation (recommended)

Replace `setInsecure()` with `setCACert()` — prevents MITM:
```cpp
// Add to config.h:
extern const char* HIVEMQ_CA_CERT;

// New file: secrets/hivemq_ca.h
const char* HIVEMQ_CA_CERT = R"CERT(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
... (ISRG Root X1, ~1.4KB)
-----END CERTIFICATE-----
)CERT";

// In mqtt_handler.cpp, replace wifiClient.setInsecure() with:
wifiClient.setCACert(HIVEMQ_CA_CERT);
```

## Change 1c — Per-device credentials (before multi-device production)

Currently 1 credential for all ESP32s = single point of failure. Better:
- Each ESP32 has unique username = `device_uid` (e.g. `SMF-A1B2C3D4`)
- Password generated via SMF `generateDeviceCredential()` (Phase 9)
- HiveMQ Access Management: create N credentials, one per unit
- ACL: each device can only publish/subscribe its own topic prefix

## Change 2 — Client ID ✅ Already unique per chip

Firmware verified using: `smartfarm_esp32_{efuseMac_hex}` (from `mqtt_handler.cpp:111`) — MAC-derived, unique per unit. No change needed for uniqueness.

**Optional standardization:** match SMF convention `smf_device_{device_uid}`:
```cpp
String clientId = "smf_device_" + String(DEVICE_UID);  // DEVICE_UID = your SMF-XXXXX
```
Only matters if HiveMQ ACL uses client ID pattern matching — currently not enforced.

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
