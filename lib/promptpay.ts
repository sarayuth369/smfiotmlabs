/**
 * PromptPay QR payload generator (EMV Merchant Presented QR).
 * Supports mobile number (10 digits) and national ID (13 digits).
 * Ref: BOT PromptPay QR spec — Merchant Payment (Type 29).
 */

function tlv(id: string, value: string): string {
  return id + value.length.toString().padStart(2, "0") + value;
}

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function formatTarget(rawId: string): string {
  const id = rawId.replace(/\D/g, "");
  if (id.length === 13) return id; // national ID
  if (id.length === 10 && id.startsWith("0")) {
    return "0066" + id.slice(1); // mobile → +66 prefix
  }
  return id.padStart(13, "0"); // best-effort
}

export function buildPromptPayPayload(receiverId: string, amount?: number): string {
  const target = formatTarget(receiverId);
  const guid = tlv("00", "A000000677010111");
  const account =
    target.length === 13 && !target.startsWith("0066")
      ? tlv("02", target) // national ID
      : tlv("01", target); // mobile

  const merchantAccount = tlv("29", guid + account);

  const payload = [
    tlv("00", "01"), // Payload Format Indicator
    tlv("01", amount ? "12" : "11"), // 11 static, 12 dynamic (with amount)
    merchantAccount,
    tlv("53", "764"), // Transaction Currency = THB
    amount ? tlv("54", amount.toFixed(2)) : "",
    tlv("58", "TH"), // Country Code
  ].join("");

  const withCrcId = payload + "6304";
  return withCrcId + crc16(withCrcId);
}

export const PROMPTPAY_ID = process.env.NEXT_PUBLIC_PROMPTPAY_ID || "0000000000";
export const PROMPTPAY_NAME = process.env.NEXT_PUBLIC_PROMPTPAY_NAME || "M Labs";
