# ESP32 Firmware Management (Phase 5.0)

Architecture overview. See [esp32-usb-flashing.md](esp32-usb-flashing.md) + [esp32-ota.md](esp32-ota.md) for concrete flows.

## Current firmware state (audited)

- Location: `D:\ArduinoProjects\ESP32 S3 N16R8\firmware\main_board\`
- Build system: **PlatformIO** (`platformio.ini`)
- Board: `esp32-s3-devkitc-1` (ESP32-S3 N16R8 — 16MB flash, 8MB PSRAM)
- Framework: Arduino
- Artifacts (verified in `.pio/build/esp32-s3-devkitc-1/`):
  | File | Size | Flash offset |
  |---|---|---|
  | `bootloader.bin` | 14.8 KB | `0x0000` |
  | `partitions.bin` | (present) | `0x8000` |
  | `boot_app0.bin` | (from Arduino tools) | `0xe000` |
  | `firmware.bin` | 1.0 MB | `0x10000` |

- Upload port: USB-C **COM** (CH343P), NOT USB-OTG
- Upload speed: 921600
- Firmware version: currently no explicit version constant in code — Phase 5.1 recommends adding `#define FIRMWARE_VERSION "0.1.0"` in `config.h`

## Data model

Section 24 of `SUPABASE_SETUP.md`:

- `firmware_releases` — versioned artifact registry, admin creates + approves + sets `is_latest`
- `firmware_update_jobs` — per-device OTA state machine (11 states)
- Storage bucket `firmware/` (private) — actual binary artifacts

**RLS:**
- Users see only APPROVED releases matching their device's `hardware_model`
- Users see own device's update jobs (via farm chain)
- Only service_role writes both tables

## Web UI (Phase 5.0 delivered)

- `/admin/firmware` — release list + status + LATEST marker
- Server actions: `createFirmwareRelease`, `approveFirmwareRelease`, `setFirmwareLatest`

**Phase 5.1 backlog (not yet built):**
- Artifact upload UI (multipart or signed direct-to-Storage)
- Web USB flasher (`esptool-js` integration)
- Per-device Firmware section (Current / Latest / Update button)

## Firmware version + hardware model (recommended firmware changes)

Add to `include/config.h`:
```cpp
#define FIRMWARE_VERSION  "0.1.0"
#define HARDWARE_MODEL    "SMF-MAIN-V1"
```

Publish in `farm/device/status` payload:
```cpp
doc["firmware_version"] = FIRMWARE_VERSION;
doc["hardware_model"]   = HARDWARE_MODEL;
```

Ingest side updates `iot_nodes.firmware_version` + `hardware_model` from every status heartbeat.

## OTA architecture (spec — Phase 5.2 implement)

See [esp32-ota.md](esp32-ota.md).

## Security principles

- **Firmware download HTTPS only** — never plain HTTP
- **SHA256 mandatory** — verify before install
- **Signed URLs short-lived** (60s TTL) — refresh from server on retry
- **Digital signature (Ed25519)** — Phase 5.3 (SHA256 = integrity, signature = authenticity)
- **RBAC:** admin creates releases, user triggers OTA on own devices only
- **No secrets in firmware** — signing verification uses public key (safe to bundle)

## Files changed (Phase 5.0)

| File | Purpose |
|---|---|
| `SUPABASE_SETUP.md` §24 | schema for `firmware_releases` + `firmware_update_jobs` |
| `lib/firmware-manifest.ts` | manifest type + validators + SHA256 verify helper |
| `app/admin/(protected)/firmware/page.tsx` | release list dashboard |
| `app/admin/(protected)/firmware/actions.ts` | create/approve/setLatest server actions |
| `lib/admin/rbac.ts` | add `firmware` module (super_admin + admin) |
| `app/admin/(protected)/layout.tsx` | add nav item |
| `docs/esp32-firmware-management.md` | this doc |
| `docs/esp32-usb-flashing.md` | Web USB flash spec |
| `docs/esp32-ota.md` | OTA spec |

## Files NOT changed (Phase 5.0 constraint)

- ESP32 firmware source (`D:\ArduinoProjects\ESP32 S3 N16R8\`) — untouched
- SMF001 production — untouched
- MQTT infrastructure — untouched
- Physical devices — not flashed

## Recommendation Phase 5.1

1. **Storage bucket creation** — Supabase Dashboard → Storage → New bucket `firmware` (private, 16 MB limit)
2. **Artifact upload UI** — admin form multi-file upload → signed upload URL → `createFirmwareRelease` with paths
3. **Web USB flasher** — install `esptool-js`, create `/dashboard/devices/[id]/flash` page
4. **First real release** — build test firmware v0.1.0, upload artifacts, approve, `is_latest=true`
5. **Manual USB flash test** — TEST ESP32-S3 only, verify boot + WiFi + MQTT still works
