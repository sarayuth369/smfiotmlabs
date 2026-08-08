export type PlanId = "starter" | "pro" | "business" | "enterprise";

export const PLAN_INFO: Record<
  PlanId,
  { name: string; price: number; label: string; badgeClass: string }
> = {
  starter: {
    name: "Starter",
    price: 0,
    label: "ฟรี",
    badgeClass: "bg-brand-100 text-brand-800",
  },
  pro: {
    name: "Pro",
    price: 499,
    label: "฿499 / เดือน",
    badgeClass: "bg-brand-600 text-white",
  },
  business: {
    name: "Business",
    price: 899,
    label: "฿899 / เดือน",
    badgeClass: "bg-brand-800 text-white",
  },
  enterprise: {
    name: "Enterprise",
    price: 0,
    label: "Contact Sales",
    badgeClass: "bg-brand-900 text-white",
  },
};
