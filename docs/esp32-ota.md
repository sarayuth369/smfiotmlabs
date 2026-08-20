# ESP32 OTA Update (Phase 5.0 spec, 5.2 firmware implementation)

Over-the-air firmware update via MQTT command + HTTPS download. Uses ESP32 dual-partition OTA — safe rollback on boot failure.

## OTA state machine

```
CURRENT
  ↓ admin publishes new firmware, marks is_latest
UPDATE_AVAILABLE
  ↓ user clicks "Update Firmware" in web
REQUESTED           — server inserts firmware_update_jobs row
  ↓ MQTT publish smf/{customer}/{device}/command
    { "command":"ota_update", "release_id":"...", "manifest_url":"..." }
DOWNLOADING         — ESP32 reports progress via /response
  ↓
VERIFYING           — ESP32 checks SHA256 of downloaded blob
  ↓ if mismatch: FAILED
INSTALLING          — ESP32 writes to inactive OTA partition
  ↓
REBOOTING           — ESP32 sets next-boot partition + esp_restart()
  ↓
HEALTH_CHECK        — ESP32 reboots into new firmware, connects WiFi + MQTT,
  ↓                   publishes farm/device/status with new firmware_version
SUCCESS             — Server matches version, marks job success
                      Marks new partition as valid (esp_ota_mark_app_valid_cancel_rollback)
  ↓
CURRENT (new version)

FAILURE PATHS:
- Download HTTP error → FAILED, no partition change, no reboot
- SHA256 mismatch → FAILED
- Install write error → FAILED, previous partition still active
- Boot failure (health check timeout, WiFi fail, MQTT fail) → ROLLED_BACK
  ESP32 automatically boots previous partition on next reset
```

## Firmware OTA code (Arduino + PlatformIO — Phase 5.2 to add)

Add to `firmware/main_board/`:

**Dependencies (`platformio.ini`):**
```ini
lib_deps =
  ...existing...
  https://github.com/espressif/arduino-esp32.git  ; already includes esp_ota
```

**New file `include/ota_manager.h`:**
```cpp
#pragma once
namespace OtaManager {
  void begin();
  void loop();
  // Called by mqtt_handler when {"command":"ota_update"} arrives
  void handleUpdateCommand(const char* release_id, const char* manifest_url, const char* expected_sha256);
}
```

**New file `src/ota_manager.cpp`** — key pieces (~200 lines):
```cpp
#include <esp_ota_ops.h>
#include <HTTPClient.h>
#include <Update.h>
#include <WiFiClientSecure.h>
#include "mqtt_topics.h"
#include "hivemq_ca.h"

void handleUpdateCommand(const char* release_id, const char* url, const char* expected_sha256) {
  publishOtaState(release_id, "downloading", 0);

  WiFiClientSecure client;
  client.setCACert(HIVEMQ_CA_CERT);   // reuse existing pinned root
  HTTPClient http;
  if (!http.begin(client, url)) {
    publishOtaState(release_id, "failed", 0, "http_begin");
    return;
  }
  int code = http.GET();
  if (code != HTTP_CODE_OK) {
    publishOtaState(release_id, "failed", 0, "http_get");
    return;
  }
  int len = http.getSize();
  if (!Update.begin(len)) {
    publishOtaState(release_id, "failed", 0, "update_begin");
    return;
  }

  // Stream to Update + hash simultaneously
  mbedtls_sha256_context sha_ctx;
  mbedtls_sha256_init(&sha_ctx);
  mbedtls_sha256_starts(&sha_ctx, 0);

  WiFiClient* stream = http.getStreamPtr();
  uint8_t buf[1024];
  int written = 0;
  while (http.connected() && written < len) {
    size_t avail = stream->available();
    if (avail > 0) {
      int r = stream->readBytes(buf, min(avail, sizeof(buf)));
      Update.write(buf, r);
      mbedtls_sha256_update(&sha_ctx, buf, r);
      written += r;
      if (written % 32768 == 0) publishOtaState(release_id, "downloading", (written * 100) / len);
    }
    delay(1);
  }

  publishOtaState(release_id, "verifying", 100);
  uint8_t computed_hash[32];
  mbedtls_sha256_finish(&sha_ctx, computed_hash);
  char computed_hex[65];
  for (int i = 0; i < 32; i++) sprintf(computed_hex + i * 2, "%02x", computed_hash[i]);
  computed_hex[64] = 0;
  if (strcasecmp(computed_hex, expected_sha256) != 0) {
    Update.abort();
    publishOtaState(release_id, "failed", 100, "sha256_mismatch");
    return;
  }

  if (!Update.end(true)) {
    publishOtaState(release_id, "failed", 100, "update_end");
    return;
  }

  publishOtaState(release_id, "installing", 100);
  publishOtaState(release_id, "rebooting", 100);
  delay(1000);
  ESP.restart();
}
```

**On boot after OTA — health check (in `main.cpp` setup()):**
```cpp
// After WiFi + MQTT connected successfully:
const esp_partition_t* running = esp_ota_get_running_partition();
esp_ota_img_states_t state;
if (esp_ota_get_state_partition(running, &state) == ESP_OK) {
  if (state == ESP_OTA_IMG_PENDING_VERIFY) {
    // Health check passed (we got this far = WiFi + MQTT work)
    esp_ota_mark_app_valid_cancel_rollback();
    Serial.println("[OTA] new firmware validated");
    publishOtaState(currentReleaseId, "success", 100);
  }
}
```

## Backend (Vercel)

**Server action `requestOtaUpdate(deviceId, releaseId)`:**
1. Verify user owns device
2. Verify release is approved + compatible hardware_model
3. Verify device not already in active OTA job (partial UNIQUE index)
4. Insert `firmware_update_jobs` (state='requested')
5. Publish MQTT `smf/{customer}/{device}/command` with `command:"ota_update"` + short-lived signed URL + SHA256

**Ingest handler for OTA state reports** (extend `/api/telemetry/ingest`):
- Recognize `event_type:"ota"` events
- Update `firmware_update_jobs.state` + `progress`
- Terminal states (success/failed) → set `completed_at`

## OTA partition (ESP32-S3 default Arduino)

Default Arduino partition table for ESP32-S3 with >4MB flash includes:
- `nvs` — key/value
- `otadata` — active partition marker
- `app0` — OTA slot 0 (~1.5 MB)
- `app1` — OTA slot 1 (~1.5 MB)
- `spiffs` — data

**Total OTA-usable app space:** ~1.5 MB per slot. Current firmware size 1.0 MB = plenty of headroom.

**Verify current partition scheme:**
```bash
cd D:\ArduinoProjects\ESP32 S3 N16R8\firmware\main_board
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run --target uploadfs --list-targets
# or open .pio/build/esp32-s3-devkitc-1/partitions.csv
```

If firmware exceeds ~1.5 MB, switch to `min_spiffs.csv` (~1.9 MB per app slot) via `platformio.ini`:
```ini
board_build.partitions = min_spiffs.csv
```

## Security

- **MQTT topic per device** — device receives OTA command only on its own topic (ACL enforces)
- **Signed URL 60s TTL** — expires before download completes if MITM'd (large firmware = ~30-90s download)
- **SHA256 mandatory** — computed while streaming, no separate download
- **Digital signature (Ed25519)** — Phase 5.3 (SHA256 = integrity only, signature = authenticity)
- **Health check + auto-rollback** — ESP32-S3 hardware ensures never-brick guarantee
- **Server verifies success** — matches `iot_nodes.firmware_version` (from status heartbeat) against `firmware_update_jobs.to_version`

## Rollback

**Automatic (firmware level):**
- ESP32-S3 marks new partition PENDING_VERIFY after OTA install
- On next boot: bootloader runs new firmware
- New firmware has ~30s to call `esp_ota_mark_app_valid_cancel_rollback()`
- If it doesn't (crash, WiFi fail, MQTT fail): next reset triggers automatic rollback to previous partition
- No brick possible — bootloader always has fallback

**Manual (admin):**
- Delete `is_latest=true` from bad release
- Set previous release `is_latest=true`
- Devices will see UPDATE_AVAILABLE for the older version + reinstall

**User-facing (web):**
- Show OTA job history on device page (`firmware_update_jobs` filtered by device_id)
- If a rollback occurred, badge: "⚠ Update failed — auto-rolled back to v0.1.0"

## Testing

**Positive case:**
1. Flash v0.1.0 via USB (initial)
2. Admin uploads v0.2.0 → approves → sets latest
3. User clicks "Update Firmware"
4. ESP32 downloads + verifies + installs + reboots into v0.2.0
5. Device page shows v0.2.0 + `firmware_update_jobs.state='success'`

**Negative cases:**
- Wrong hardware_model → server rejects request
- Corrupted download → SHA256 mismatch → state='failed', no partition change
- New firmware crashes boot → auto-rollback → device back on v0.1.0
- Concurrent OTA request → 2nd blocked by partial UNIQUE index

## What Phase 5.0 delivered

- Database schema for OTA jobs (Section 24.2)
- Manifest type ready to serve to ESP32 (`lib/firmware-manifest.ts`)
- State machine documented

## What Phase 5.2 adds (firmware side)

- `ota_manager.cpp` + `ota_manager.h`
- Wire into `mqtt_handler` command dispatcher
- Health check in `main.cpp` setup()
- `secrets.h` unchanged — reuses `HIVEMQ_CA_CERT`

## What Phase 5.3 adds (production hardening)

- Ed25519 signing key pair
- Firmware signed at release time (admin server action generates signature)
- ESP32 verifies signature before install (bundles public key at build time)
- Signature != SHA256: SHA256 catches corruption; signature proves it came from SMF admin
