import type { AdminRole } from "./session";

export type Module =
  | "dashboard"
  | "members"
  | "farms"
  | "devices"
  | "firmware"
  | "sensors"
  | "ai"
  | "subscriptions"
  | "pricing"
  | "plan_limits"
  | "products"
  | "orders"
  | "plan_orders"
  | "payments"
  | "income"
  | "notifications"
  | "content"
  | "settings"
  | "admin_users"
  | "logs"
  | "mqtt"
  | "support_chat";

const MATRIX: Record<AdminRole, Module[]> = {
  super_admin: [
    "dashboard","members","farms","devices","firmware","sensors","ai","subscriptions","pricing","plan_limits","products","orders","plan_orders",
    "payments","income","notifications","content","settings","admin_users","logs","mqtt","support_chat",
  ],
  admin: [
    "dashboard","members","farms","devices","firmware","sensors","ai","subscriptions","pricing","plan_limits","products","orders","plan_orders",
    "payments","income","notifications","logs","mqtt","support_chat",
  ],
  support: ["dashboard","members","farms","subscriptions","payments","notifications","orders","plan_orders","support_chat"],
  sales: ["dashboard","members","subscriptions","products","orders","plan_orders","payments","income"],
  technician: ["dashboard","farms","devices","sensors","products","logs","mqtt"],
  content: ["dashboard","notifications","content"],
};

export function canAccess(role: AdminRole, mod: Module): boolean {
  return MATRIX[role]?.includes(mod) ?? false;
}

export const ROLE_LABEL: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  support: "Support",
  sales: "Sales",
  technician: "Technician",
  content: "Content Manager",
};
