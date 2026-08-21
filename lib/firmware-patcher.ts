/**
 * Phase 6.2 — firmware binary patcher.
 *
 * Overwrites the ProvisioningSlot region in a base firmware.bin with
 * per-device values. Zero PlatformIO recompile per device.
 *
 * Slot layout (see firmware/main_board/src/provisioning.cpp, MUST stay
 * in sync byte-for-byte with the struct declaration):
 *
 *   offset  length   field
 *   +0      16       begin_marker    "SMFIOTPROVBEG" + null pad
 *   +16     64       mqtt_host       "mqtt.bkknex.com" + null pad
 *   +80     40       customer_id     UUID (36) + null + pad
 *   +120    24       device_uid      "SMF-XXXXXX" + null + pad
 *   +144    24       mqtt_user       = device_uid
 *   +168    65       mqtt_pass       32-char random + null + pad
 *   +233    16       end_marker      "SMFIOTPROVEND" + null pad
 *   total   249      bytes
 *
 * Patch procedure:
 *  1. Read base firmware.bin into memory
 *  2. Find EXACTLY ONE occurrence of BEGIN marker (else throw)
 *  3. Verify END marker is at BEGIN + 233 (else throw — layout mismatch)
 *  4. Overwrite fields at fixed offsets with null-padded values
 *  5. Return patched bytes
 *  6. Caller may verify a re-hash and log audit
 *
 * Safety:
 *  - Rejects if either marker missing or duplicated
 *  - Rejects if value string longer than field capacity - 1 (needs null term)
 *  - Rejects if UUID doesn't match expected format
 *  - Never mutates the input Uint8Array (returns fresh copy)
 */

const BEGIN_MARKER = "SMFIOTPROVBEG";
const END_MARKER = "SMFIOTPROVEND";

// Field offsets relative to BEGIN marker start.
const SLOT = {
  begin:       { offset: 0,   length: 16 },
  mqtt_host:   { offset: 16,  length: 64 },
  customer_id: { offset: 80,  length: 40 },
  device_uid:  { offset: 120, length: 24 },
  mqtt_user:   { offset: 144, length: 24 },
  mqtt_pass:   { offset: 168, length: 65 },
  end:         { offset: 233, length: 16 },
} as const;

const SLOT_TOTAL_LEN = 249;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DEVICE_UID_RE = /^SMF-[A-F0-9]{6,20}$/;

export type ProvisioningValues = {
  mqtt_host: string;
  customer_id: string;
  device_uid: string;
  mqtt_user: string;
  mqtt_pass: string;
};

/** Locate the sole occurrence of a substring, or throw. */
function findUniqueOffset(haystack: Uint8Array, needle: string): number {
  const target = new TextEncoder().encode(needle);
  let first = -1;
  let count = 0;
  outer: for (let i = 0; i <= haystack.length - target.length; i++) {
    for (let j = 0; j < target.length; j++) {
      if (haystack[i + j] !== target[j]) continue outer;
    }
    if (first < 0) first = i;
    count++;
    if (count > 1) {
      throw new Error(`firmware-patcher: marker "${needle}" found ${count}+ times (expected 1)`);
    }
  }
  if (count === 0) throw new Error(`firmware-patcher: marker "${needle}" not found in binary`);
  return first;
}

/** Write a null-padded UTF-8 string into buf[offset..offset+length]. */
function writeField(
  buf: Uint8Array,
  offset: number,
  length: number,
  value: string,
  fieldName: string
): void {
  const encoded = new TextEncoder().encode(value);
  if (encoded.length > length - 1) {
    throw new Error(
      `firmware-patcher: field ${fieldName} value length ${encoded.length} exceeds capacity ${length - 1} (needs null terminator)`
    );
  }
  // Zero the region first (defensive — value may be shorter than previous)
  for (let i = 0; i < length; i++) buf[offset + i] = 0;
  // Copy value bytes
  for (let i = 0; i < encoded.length; i++) buf[offset + i] = encoded[i];
  // Trailing bytes remain 0
}

/**
 * Patch a base firmware.bin with per-device provisioning values.
 * Returns a fresh Uint8Array — original input unchanged.
 * Throws on any marker/format/length error.
 */
export function patchFirmware(
  baseBinary: Uint8Array,
  values: ProvisioningValues
): Uint8Array {
  if (!UUID_RE.test(values.customer_id)) {
    throw new Error(`firmware-patcher: customer_id "${values.customer_id}" is not a valid UUID`);
  }
  if (!DEVICE_UID_RE.test(values.device_uid)) {
    throw new Error(`firmware-patcher: device_uid "${values.device_uid}" invalid (expect SMF-{hex})`);
  }
  if (values.mqtt_user !== values.device_uid) {
    throw new Error(`firmware-patcher: mqtt_user must equal device_uid`);
  }
  if (values.mqtt_pass.length < 16) {
    throw new Error(`firmware-patcher: mqtt_pass too short (${values.mqtt_pass.length}, min 16)`);
  }
  if (!values.mqtt_host || values.mqtt_host.length > SLOT.mqtt_host.length - 1) {
    throw new Error(`firmware-patcher: mqtt_host missing or too long`);
  }

  const begin = findUniqueOffset(baseBinary, BEGIN_MARKER);
  const end = findUniqueOffset(baseBinary, END_MARKER);

  const expectedEndOffset = begin + SLOT.end.offset;
  if (end !== expectedEndOffset) {
    throw new Error(
      `firmware-patcher: END marker at 0x${end.toString(16)} but expected 0x${expectedEndOffset.toString(16)} (BEGIN+${SLOT.end.offset}) — slot layout mismatch, likely wrong firmware version`
    );
  }

  // Fresh copy — never mutate input
  const patched = new Uint8Array(baseBinary);

  writeField(patched, begin + SLOT.mqtt_host.offset,   SLOT.mqtt_host.length,   values.mqtt_host,   "mqtt_host");
  writeField(patched, begin + SLOT.customer_id.offset, SLOT.customer_id.length, values.customer_id, "customer_id");
  writeField(patched, begin + SLOT.device_uid.offset,  SLOT.device_uid.length,  values.device_uid,  "device_uid");
  writeField(patched, begin + SLOT.mqtt_user.offset,   SLOT.mqtt_user.length,   values.mqtt_user,   "mqtt_user");
  writeField(patched, begin + SLOT.mqtt_pass.offset,   SLOT.mqtt_pass.length,   values.mqtt_pass,   "mqtt_pass");
  // Markers untouched — sanity check preserved

  return patched;
}

/** SHA-256 hex of bytes (Web Crypto API, works in Node 18+ / edge / browser). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Copy into an ArrayBuffer view — TypeScript's stricter DOM typing rejects
  // Uint8Array<ArrayBufferLike> for crypto.subtle.digest.
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Utility for tests / dev: print slot region as hex + ASCII. */
export function inspectSlot(binary: Uint8Array): string {
  const begin = findUniqueOffset(binary, BEGIN_MARKER);
  const slot = binary.slice(begin, begin + SLOT_TOTAL_LEN);
  const asciiOf = (b: number) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : ".");
  const lines: string[] = [];
  for (let i = 0; i < slot.length; i += 16) {
    const chunk = slot.slice(i, i + 16);
    const hex = Array.from(chunk).map((b) => b.toString(16).padStart(2, "0")).join(" ");
    const ascii = Array.from(chunk).map(asciiOf).join("");
    lines.push(`+${i.toString().padStart(3)}  ${hex.padEnd(48)}  ${ascii}`);
  }
  return lines.join("\n");
}

export const SLOT_LAYOUT = SLOT;
export const SLOT_LENGTH = SLOT_TOTAL_LEN;
