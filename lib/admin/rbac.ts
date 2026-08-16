import type { AdminRole } from "./session";

export type Module =
  | "dashboard"
  | "members"
  | "farms"
  | "devices"
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
  | "logs";

const MATRIX: Record<AdminRole, Module[]> = {
  super_admin: [
    "dashboard","members","farms","devices","subscriptions","pricing","plan_limits","products","orders","plan_orders",
    "payments","income","notifications","content","settings","admin_users","logs",
  ],
  admin: [
    "dashboard","members","farms","devices","subscriptions","pricing","plan_limits","products","orders","plan_orders",
    "payments","income","notifications","logs",
  ],
  support: ["dashboard","members","farms","subscriptions","payments","notifications","orders","plan_orders"],
  sales: ["dashboard","members","subscriptions","products","orders","plan_orders","payments","income"],
  technician: ["dashboard","farms","devices","products","logs"],
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
