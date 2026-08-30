/**
 * Firmware manifest — canonical schema for both USB flash + OTA.
 * Used by:
 *   - Admin firmware release create action (build manifest from artifact metadata)
 *   - Web USB flasher (fetch signed URLs, drive esptool-js)
 *   - ESP32 OTA client (parse manifest, verify SHA256, install)
 *
 * Server-only helpers — client code imports the type but never the signer.
 */

export type FirmwareChannel = "test" | "stable" | "deprecated" | "revoked";
export type ArtifactRole = "bootloader" | "partitions" | "boot_app0" | "app";

/** Standard ESP32-S3 Arduino partition flash offsets (verified from PIO build). */
export const ESP32_S3_FLASH_OFFSETS: Record<ArtifactRole, number> = {
  bootloader: 0x0000,
  partitions: 0x8000,
  boot_app0: 0xe000,
  app: 0x10000, // ota_0 (app0) — the only app slot on a factory/pre-OTA board
};

/**
 * app1 (ota_1) — the SECOND app slot in this board's dual-OTA partition
 * table (verified against the compiled .pio/build partitions.bin: app0 @
 * 0x10000, app1 @ 0x340000, both 3264K). Once a device has ever completed
 * an OTA update, the bootloader may be running from EITHER slot — a USB/
 * Web flash that only writes app0 can silently target the INACTIVE slot,
 * leaving the actually-running app1 untouched (confirmed in production:
 * device kept booting stale/wrong credentials after a "successful" USB
 * re-flash). Every USB/Web app write must therefore write the SAME patched
 * bytes to BOTH offsets so it's correct regardless of which slot is
 * currently active. This is safe — esptool/Web Serial flashing happens
 * with the chip halted in ROM bootloader mode, not executing from flash.
 */
export const ESP32_S3_APP_ALT_OFFSET = 0x340000;

export type FirmwareArtifact = {
  role: ArtifactRole;
  offset: number;
  url: string; // signed URL (short-lived) OR relative storage path (server-side)
  size: number;
  sha256: string; // hex, lowercase, 64 chars
};

export type FirmwareManifest = {
  release_id: string;
  version: string;
  build?: string | null;
  board: string; // e.g. "ESP32-S3"
  hardware_model: string; // e.g. "SMF-MAIN-V1"
  channel: FirmwareChannel;
  artifacts: FirmwareArtifact[];
  sha256_app: string;
  min_firmware_version?: string | null;
  release_notes?: string | null;
  /** ISO timestamp when manifest was generated + signed URLs valid until */
  issued_at: string;
  expires_at: string;
};

/**
 * Validate a manifest returned by the server before use.
 * Client-safe (no secrets required).
 */
export function isValidManifest(m: unknown): m is FirmwareManifest {
  if (!m || typeof m !== "object") return false;
  const x = m as Record<string, unknown>;
  if (typeof x.version !== "string" || !/^\d+\.\d+\.\d+/.test(x.version)) return false;
  if (typeof x.board !== "string" || x.board.length === 0) return false;
  if (typeof x.hardware_model !== "string" || x.hardware_model.length === 0) return false;
  if (!Array.isArray(x.artifacts) || x.artifacts.length === 0) return false;
  const hasApp = (x.artifacts as unknown[]).some(
    (a) => a && typeof a === "object" && (a as Record<string, unknown>).role === "app"
  );
  if (!hasApp) return false;
  if (typeof x.sha256_app !== "string" || x.sha256_app.length !== 64) return false;
  return true;
}

/** Verify a fetched artifact matches its declared SHA256. */
export async function verifyArtifactSha256(bytes: ArrayBuffer, expectedHex: string): Promise<boolean> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex === expectedHex.toLowerCase();
}

/** Total flash size (sum of all artifacts) — used for UI progress budget */
export function totalManifestSize(m: FirmwareManifest): number {
  return m.artifacts.reduce((sum, a) => sum + a.size, 0);
}
