import type { SKU } from "./hardware";

const PREFIX: Record<SKU, string> = {
  starter_node: "SN",
  pro_node: "PN",
  complete_kit: "CK",
};

/** Order number format: {SN|PN|CK}-YYYYMMDD-XXXX  e.g. PN-20260813-4KZ2 */
export function generateOrderNumber(sku: SKU): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${PREFIX[sku]}-${yyyy}${mm}${dd}-${rand}`;
}

export type ShippingInfo = {
  ship_name: string;
  ship_phone: string;
  ship_address: string;
  ship_city: string;
  ship_postal: string;
  ship_note: string;
};

export function parseShippingFromForm(fd: FormData): ShippingInfo {
  return {
    ship_name: String(fd.get("ship_name") ?? "").trim(),
    ship_phone: String(fd.get("ship_phone") ?? "").trim(),
    ship_address: String(fd.get("ship_address") ?? "").trim(),
    ship_city: String(fd.get("ship_city") ?? "").trim(),
    ship_postal: String(fd.get("ship_postal") ?? "").trim(),
    ship_note: String(fd.get("ship_note") ?? "").trim(),
  };
}

export function validateShipping(s: ShippingInfo): string | null {
  if (!s.ship_name) return "กรุณากรอกชื่อผู้รับ";
  if (!s.ship_phone) return "กรุณากรอกเบอร์โทร";
  if (!s.ship_address) return "กรุณากรอกที่อยู่";
  if (!s.ship_city) return "กรุณากรอกจังหวัด/อำเภอ";
  if (!s.ship_postal || !/^\d{5}$/.test(s.ship_postal)) return "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก";
  if (!/^[0-9\-\s+]{9,}$/.test(s.ship_phone)) return "รูปแบบเบอร์โทรไม่ถูกต้อง";
  return null;
}
