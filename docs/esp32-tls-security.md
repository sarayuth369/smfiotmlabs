# ESP32 MQTT TLS Security (Phase 4.6)

Firmware TLS hardening — upgraded from `setInsecure()` (encrypted, cert not validated) to `setCACert(ISRG_ROOT_X1)` (full chain validation).

## Threat model (before Phase 4.6)

- ✅ Traffic encrypted (attacker sniffing WiFi can't read payload)
- ❌ Any cert accepted — rogue AP / ISP could MITM by presenting their own cert to ESP32 + real cert to HiveMQ, sitting in middle reading/modifying every message
- ❌ Compromised WiFi = compromised sensor data + relay commands

## Threat model (after Phase 4.6)

- ✅ Traffic encrypted
- ✅ Server cert validated against pinned ISRG Root X1 (Let's Encrypt root)
- ✅ MITM blocked at TLS handshake — rogue cert = `rc=-2` connection refused
- ⚠ NTP time must be correct — cert validation checks expiry (uses ESP32 clock)

## Files changed (firmware repo)

| Path | Change |
|---|---|
| `include/hivemq_ca.h` | **NEW** — ISRG Root X1 PEM (public, safe to commit) |
| `src/mqtt_handler.cpp` | `setInsecure()` → `setCACert(HIVEMQ_CA_CERT)` + rc=-2 diagnostics |
| `include/secrets.h` | **unchanged** — MQTT_USER/PASSWORD stay here |
| `.gitignore` | **unchanged** — `secrets.h` already ignored, `hivemq_ca.h` public |

## Certificate details

- **Root CA:** ISRG Root X1
- **Type:** RSA 4096
- **Valid until:** 2035-06-04
- **Source:** https://letsencrypt.org/certs/isrgrootx1.pem
- **Why this one:** HiveMQ Cloud Serverless issues certs via Let's Encrypt → all chain up to ISRG Root X1

## Dev fallback (compile-time only)

Emergency escape hatch when debugging TLS issues:

```cpp
// In secrets.h OR platformio.ini build_flags:
#define MQTT_TLS_INSECURE 1
```

Effect: firmware falls back to `setInsecure()` + logs prominent warning:
```
[MQTT] ⚠ TLS INSECURE MODE — cert validation disabled (dev only)
```

**Never ship with this flag set.** Grep before every release:
```bash
grep -r "MQTT_TLS_INSECURE" include/ platformio.ini
```

## Certificate rotation procedure

If HiveMQ rotates their root CA (rare — Let's Encrypt uses ISRG Root X1 for years):

1. Fetch new root cert:
```bash
openssl s_client -showcerts -connect <cluster>.hivemq.cloud:8883 </dev/null 2>/dev/null | \
  awk '/BEGIN CERTIFICATE/,/END CERTIFICATE/' | tail -n +$(grep -n END /dev/stdin | tail -1 | cut -d: -f1)
```
(copy LAST cert block = root anchor)
2. Replace PEM in `include/hivemq_ca.h`
3. Rebuild + flash all deployed ESP32s
4. Verify Serial output: `[MQTT] TLS pinned to ISRG Root X1` + `MQTT connected`

**Warning signs cert has rotated:**
- `rc=-2` connection refused after months of working
- Serial log: `[MQTT] -> TLS handshake refused`
- Same time, HiveMQ web dashboard works fine → cert issue not credential

## NTP requirement

TLS validation requires correct time. ESP32 firmware must sync NTP before MQTT connect. Verify `wifi_manager.cpp` calls `configTime()` and waits for sync.

If time is 1970 or years off → all certs look "expired" → `rc=-2`.

## Diagnostic output (Serial monitor)

**Successful connect:**
```
[MQTT] TLS pinned to ISRG Root X1
[MQTT] connecting to c3a0a4b369d142129741b4e3178a06f7.s1.eu.hivemq.cloud:8883 ... (free heap=180000) connected (2340 ms)
```

**Certificate mismatch:**
```
[MQTT] TLS pinned to ISRG Root X1
[MQTT] connecting to ... failed, rc=-2 (450 ms elapsed)
[MQTT]   -> TLS handshake refused.
[MQTT]      Cert may have rotated — check include/hivemq_ca.h
[MQTT]      or NTP time not synced (cert validation needs correct clock).
```

**Wrong MQTT credential (not TLS):**
```
[MQTT] connecting to ... failed, rc=-4 or -5
```
(rc=-5 = MQTT_CONNECT_UNAUTHORIZED → credential wrong, not TLS)

## Google Sheets uploader — separate

`src/sheets_uploader.cpp` also uses `setInsecure()` for Google Sheets API. **Not changed** — Google rotates certs frequently + Sheets is best-effort logging (not critical path). Documented as known low-severity risk. Upgrade path: fetch GTS Root R1 cert + pin similarly.

## SMF001 impact assessment

- **Firmware source:** modified (2 files)
- **SMF001 test unit:** still running old firmware = still works via `setInsecure()`
- **After reflash:** connects via `setCACert()` — must have valid NTP time + HiveMQ using Let's Encrypt cert
- **Rollback:** flash previous firmware binary if handshake fails

## Build + flash procedure

```bash
cd "D:\ArduinoProjects\ESP32 S3 N16R8\firmware\main_board"
pio run                        # compile only
# If compile OK:
pio run -t upload              # flash connected ESP32 via USB
# Then watch serial:
pio device monitor
```

Expected first boot after flash:
```
[WiFi] connected: 192.168.x.x
[Time] NTP synced: 2026-08-19 14:20:15
[MQTT] TLS pinned to ISRG Root X1
[MQTT] connecting to ... connected
[MQTT] subscribed to farm/#
```

## Rollback plan

If TLS validation causes SMF001 to stop connecting:

1. Verify NTP working (Serial log shows correct year)
2. Verify HiveMQ cluster reachable (`ping <cluster>.hivemq.cloud`)
3. Temporary: set `#define MQTT_TLS_INSECURE 1` in `secrets.h`, rebuild + flash, restore old behavior
4. Investigate: HiveMQ may have rotated cert → follow rotation procedure above

## Future — OTA

Reflashing every ESP32 to update CA cert doesn't scale. Phase 12 OTA:
- Firmware update pushed via HTTPS from Vercel
- Signed binary + rollback on failure
- Docs in Phase 12 spec

## Verification checklist

- [x] `setInsecure()` replaced with `setCACert()` in `mqtt_handler.cpp`
- [x] `hivemq_ca.h` created with valid PEM (ISRG Root X1)
- [x] `#include "hivemq_ca.h"` added
- [x] Dev fallback gated behind compile-time flag (`MQTT_TLS_INSECURE`)
- [x] `rc=-2` diagnostic added
- [x] `.gitignore` unchanged (secrets.h still ignored, CA cert public)
- [x] No password shown in this doc
- [x] No credential logged by firmware
- [ ] Compile via `pio run` (user must run)
- [ ] Flash SMF001 (user decision — regression risk)
