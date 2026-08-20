# ESP32 USB Flashing via Web (Phase 5.0 spec, 5.1 implementation)

Browser-based initial firmware flash using Web Serial API + esptool-js.

## Browser support

**Web Serial API** required (`navigator.serial`):

| Browser | Support | Notes |
|---|---|---|
| Chrome 89+ | ✅ | desktop only, HTTPS required |
| Edge 89+ | ✅ | desktop only, HTTPS required |
| Brave | ✅ | inherits Chromium |
| Opera | ✅ | inherits Chromium |
| Firefox | ❌ | not implemented (feature flagged in Nightly) |
| Safari | ❌ | Apple has publicly declined to implement |
| Mobile browsers | ❌ | none support Web Serial (Chrome Android does NOT count) |

**Detection code (client component):**
```tsx
"use client";
useEffect(() => {
  if (!("serial" in navigator)) {
    setError("Browser ไม่รองรับ — ใช้ Chrome / Edge / Brave desktop");
  }
  if (!window.isSecureContext) {
    setError("ต้องเข้าผ่าน HTTPS (https://smfiot.bkknex.com) เท่านั้น");
  }
}, []);
```

## Library — esptool-js

**Install:**
```bash
cd D:\Websites\smfiotmlabs
npm install esptool-js
```

Size: ~450 KB minified. Dynamic import in the flasher page only — no impact on other pages.

**Usage pattern (Phase 5.1 implementation stub):**

```typescript
// app/dashboard/devices/[deviceId]/flash/_components/Flasher.tsx
"use client";
import { ESPLoader, Transport } from "esptool-js";

async function flash(manifest: FirmwareManifest) {
  const port = await navigator.serial.requestPort();
  const transport = new Transport(port, true);
  const loader = new ESPLoader({
    transport,
    baudrate: 921600,
    romBaudrate: 115200,
  });

  // Detect chip — MUST be ESP32-S3
  const chip = await loader.main();
  if (chip !== "ESP32-S3") {
    throw new Error(`Wrong board: got ${chip}, expected ESP32-S3`);
  }

  // Fetch artifacts, verify SHA256
  const files = await Promise.all(
    manifest.artifacts.map(async (a) => {
      const res = await fetch(a.url);
      const buf = await res.arrayBuffer();
      const ok = await verifyArtifactSha256(buf, a.sha256);
      if (!ok) throw new Error(`SHA256 mismatch for ${a.role}`);
      return { address: a.offset, data: new Uint8Array(buf) };
    })
  );

  // Flash
  await loader.writeFlash({
    fileArray: files.map((f) => ({
      address: f.address,
      data: Array.from(f.data).map((b) => String.fromCharCode(b)).join(""),
    })),
    flashSize: "keep",
    flashMode: "keep",
    flashFreq: "keep",
    eraseAll: false,
    compress: true,
    reportProgress: (fileIndex, written, total) => {
      updateProgress(fileIndex, written / total);
    },
  });

  await loader.hardReset();
  await transport.disconnect();
}
```

## Flow

```
User (authenticated, owns device)
  ↓
/dashboard/devices/[deviceId]/flash
  ↓ browser check: Web Serial + HTTPS
Page loads latest APPROVED firmware manifest for device.hardware_model
  ↓ fetch via server action getFirmwareManifest(deviceId, releaseId)
  → returns FirmwareManifest with signed URLs (60s TTL)
  ↓
[ Connect ESP32 ] button
  ↓ navigator.serial.requestPort() — user picks USB device from browser prompt
Transport opens serial connection
  ↓ ESPLoader.main() — auto-baudrate + chip detect
Verify chip === "ESP32-S3"
  ↓ if wrong: STOP with clear error
Confirmation dialog:
  "Flash firmware v0.1.0 to ESP32-S3 (SMF-TEST-01)?"
  [ Cancel ] [ Flash ]
  ↓
Fetch each artifact:
  bootloader.bin → SHA256 verify
  partitions.bin → SHA256 verify
  firmware.bin   → SHA256 verify
  ↓
Progress UI shows real writeFlash progress per artifact
  ↓
hardReset() → ESP32 reboots
  ↓
Emit device_events row: 'firmware_flash_success' + version
  ↓
Show success + reminder:
  "ESP32 restarting. Open Serial Monitor to verify boot + WiFi + MQTT."
```

## Physical test procedure (user-run — never auto-flash)

1. Use **TEST ESP32-S3** (never SMF001 production)
2. Plug USB-C into COM port (not USB-OTG)
3. Open Chrome on https://smfiot.bkknex.com
4. Login as owner of the test device
5. Navigate: Dashboard → Devices → [test device] → **Firmware** → **Initial Flash**
6. Click **Connect ESP32**
7. Browser shows USB device picker → select the CH343P entry
8. Page shows chip info: `ESP32-S3` + MAC + flash size
9. Click **Flash Firmware** → confirm dialog → OK
10. Wait ~30-60 seconds (real progress bar)
11. Success message appears + ESP32 reboots
12. Open PlatformIO Serial Monitor OR minicom to verify boot log
13. Check SMF Web device page → device should reconnect + show ONLINE within 30s

## Recovery

- **USB disconnect mid-flash:** ESP32 may boot to bootloader mode. Reconnect USB, repeat flash. Bootloader partition intact.
- **Wrong board detected:** STOP without any flash write. Safe.
- **SHA256 mismatch:** STOP before flash. Signed URL may have expired — refresh page + retry.
- **User closes tab mid-flash:** ESP32 stuck in bootloader — hold BOOT + reset, reconnect USB, reflash.
- **Browser permission revoked:** navigate to `chrome://settings/content/serialPorts` → grant again.

## Security

- **Authenticated user only** — page under `/dashboard/*` (auth middleware)
- **Ownership check** — server verifies user owns `deviceId` via farm chain
- **Firmware from trusted storage only** — signed URLs from Supabase Storage, never user-supplied URL
- **SHA256 verify pre-flash** — catches tampered download / storage corruption
- **HTTPS mandatory** — Web Serial refuses non-secure context
- **Board mismatch = hard stop** — no override, no flag
- **Audit row on success + failure** — `device_events` with user_id + firmware version

## What Phase 5.0 delivered

- Database schema (Section 24)
- Manifest type + validation helpers (`lib/firmware-manifest.ts`)
- Admin release list (`/admin/firmware`)
- Server actions: create / approve / setLatest

## What Phase 5.1 adds

- `npm install esptool-js`
- Artifact upload UI (admin)
- Flash page component with Web Serial + progress + SHA256 verify
- Server action `getFirmwareManifest(deviceId, releaseId)` returning signed URLs
- `firmware_flash_started` / `firmware_flash_success` / `firmware_flash_failed` events
