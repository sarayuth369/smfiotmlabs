/**
 * Server-only loaders for subscription plans + hardware products.
 * Reads from Supabase (admin-editable). Falls back to hardcoded defaults if
 * the tables aren't populated yet (e.g. SQL not run).
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PlanId } from "./plans";
import type { SKU } from "./hardware";

export type PlanRow = {
  plan_id: PlanId;
  name: string;
  price: number;
  price_note: string | null;
  badge: string | null;
  audience: string[];
  features: string[];
  sort_order: number;
  is_active: boolean;
};

export type ProductRow = {
  sku: SKU;
  name: string;
  price: number;
  badge: string | null;
  badge_tier: "starter" | "best" | "pro" | "enterprise" | null;
  audience: string[];
  specs: string[];
  sort_order: number;
  is_active: boolean;
};

const DEFAULT_PLANS: PlanRow[] = [
  {
    plan_id: "starter",
    name: "Starter",
    price: 0,
    price_note: null,
    badge: "Recommended for Beginners",
    audience: ["ทดลองใช้งาน", "สวนขนาดเล็ก", "ผู้เริ่มต้น"],
    features: [
      "1 Farm","1 IoT Device","Dashboard","Realtime Monitoring",
      "Sensor History 3 Days","Mobile App","Community Support",
    ],
    sort_order: 1,
    is_active: true,
  },
  {
    plan_id: "pro",
    name: "Pro",
    price: 499,
    price_note: "/ เดือน",
    badge: "Most Popular",
    audience: ["เกษตรกรทั่วไป", "ฟาร์มขนาดเล็กถึงกลาง"],
    features: [
      "5 Farms","30 IoT Devices","Unlimited Sensors","Dashboard","Realtime","Charts",
      "Sensor History 1 Year","LINE Notification","Export Excel",
      "AI Basic Recommendation","Priority Support",
    ],
    sort_order: 2,
    is_active: true,
  },
  {
    plan_id: "business",
    name: "Business",
    price: 899,
    price_note: "/ เดือน",
    badge: null,
    audience: ["ฟาร์มขนาดใหญ่", "บริษัทเกษตร"],
    features: [
      "20 Farms","200 IoT Devices","Unlimited Sensors","Multi User","User Permission",
      "Dashboard","Advanced Analytics","Automation","API Access","AI Recommendation",
      "Export PDF","Export Excel","Priority Support",
    ],
    sort_order: 3,
    is_active: true,
  },
  {
    plan_id: "enterprise",
    name: "Enterprise",
    price: 0,
    price_note: "Contact Sales",
    badge: null,
    audience: ["โรงงาน","Smart Farm Project","OEM","Government","University"],
    features: [
      "Unlimited Farms","Unlimited Devices","Unlimited Users","White Label",
      "Private Server","Custom Dashboard","Custom Domain","SLA Support",
      "Dedicated Engineer","On-site Training","API Integration",
    ],
    sort_order: 4,
    is_active: true,
  },
];

const DEFAULT_PRODUCTS: ProductRow[] = [
  {
    sku: "starter_node",
    name: "Starter Node",
    price: 2990,
    badge: "Starter",
    badge_tier: "starter",
    audience: ["ทดลองระบบ","โรงเรือน","ฟาร์มขนาดเล็ก"],
    specs: [
      "ESP32 Controller","WiFi","Temperature Sensor","Humidity Sensor",
      "Relay 2 Channel","Ready to use","Cloud Ready",
    ],
    sort_order: 1,
    is_active: true,
  },
  {
    sku: "pro_node",
    name: "Pro Node",
    price: 4990,
    badge: "Best Seller",
    badge_tier: "best",
    audience: ["ฟาร์มทั่วไป","Smart Farm"],
    specs: [
      "ESP32","Temperature","Humidity","Soil Moisture","Light Sensor",
      "Relay 4 Channel","OTA Update","Cloud Ready","Mobile App",
    ],
    sort_order: 2,
    is_active: true,
  },
  {
    sku: "complete_kit",
    name: "Complete Smart Farm Kit",
    price: 9900,
    badge: "Professional",
    badge_tier: "pro",
    audience: ["ฟาร์มจริง","ติดตั้งพร้อมใช้งาน"],
    specs: [
      "ESP32 Pro","Soil Moisture","Temperature","Humidity","Light","Water Level",
      "Power Supply","Waterproof Box","Relay","Ready Install",
    ],
    sort_order: 3,
    is_active: true,
  },
];

export async function getSubscriptionPlans(): Promise<PlanRow[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("subscription_plans")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error || !data || data.length === 0) return DEFAULT_PLANS;
    return data as PlanRow[];
  } catch {
    return DEFAULT_PLANS;
  }
}

export async function getProducts(): Promise<ProductRow[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("products")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error || !data || data.length === 0) return DEFAULT_PRODUCTS;
    return data as ProductRow[];
  } catch {
    return DEFAULT_PRODUCTS;
  }
}

/** Look up a single plan price for Stripe amount — falls back to defaults. */
export async function getPlanPrice(planId: PlanId): Promise<number> {
  const rows = await getSubscriptionPlans();
  return rows.find((r) => r.plan_id === planId)?.price ?? 0;
}

/** Look up a single product for Stripe amount — falls back to defaults. */
export async function getProduct(sku: SKU): Promise<ProductRow | null> {
  const rows = await getProducts();
  return rows.find((r) => r.sku === sku) ?? null;
}
