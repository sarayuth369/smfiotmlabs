"use client";

import Link from "next/link";
import { useState } from "react";
import { UpgradeModal } from "./UpgradeModal";
import type { PlanId } from "@/lib/plans";

type PlanCard = {
  id: PlanId;
  name: string;
  badge: string | null;
  price: string;
  priceNote: string;
  cta: string;
  audience: string[];
  features: string[];
  variant: "outline" | "primary" | "dark";
  highlight?: boolean;
};

const plans: PlanCard[] = [
  {
    id: "starter",
    name: "Starter",
    badge: "Recommended for Beginners",
    price: "ฟรี",
    priceNote: "",
    cta: "Start Free",
    variant: "outline",
    audience: ["ทดลองใช้งาน", "สวนขนาดเล็ก", "ผู้เริ่มต้น"],
    features: [
      "1 Farm",
      "1 IoT Device",
      "Dashboard",
      "Realtime Monitoring",
      "Sensor History 3 Days",
      "Mobile App",
      "Community Support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    badge: "Most Popular",
    price: "฿499",
    priceNote: "/ เดือน",
    cta: "Upgrade to Pro",
    variant: "primary",
    highlight: true,
    audience: ["เกษตรกรทั่วไป", "ฟาร์มขนาดเล็กถึงกลาง"],
    features: [
      "5 Farms",
      "30 IoT Devices",
      "Unlimited Sensors",
      "Dashboard",
      "Realtime",
      "Charts",
      "Sensor History 1 Year",
      "LINE Notification",
      "Export Excel",
      "AI Basic Recommendation",
      "Priority Support",
    ],
  },
  {
    id: "business",
    name: "Business",
    badge: null,
    price: "฿899",
    priceNote: "/ เดือน",
    cta: "Choose Business",
    variant: "outline",
    audience: ["ฟาร์มขนาดใหญ่", "บริษัทเกษตร"],
    features: [
      "20 Farms",
      "200 IoT Devices",
      "Unlimited Sensors",
      "Multi User",
      "User Permission",
      "Dashboard",
      "Advanced Analytics",
      "Automation",
      "API Access",
      "AI Recommendation",
      "Export PDF",
      "Export Excel",
      "Priority Support",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    badge: null,
    price: "Contact Sales",
    priceNote: "",
    cta: "Contact Sales",
    variant: "dark",
    audience: ["โรงงาน", "Smart Farm Project", "OEM", "Government", "University"],
    features: [
      "Unlimited Farms",
      "Unlimited Devices",
      "Unlimited Users",
      "White Label",
      "Private Server",
      "Custom Dashboard",
      "Custom Domain",
      "SLA Support",
      "Dedicated Engineer",
      "On-site Training",
      "API Integration",
    ],
  },
];

function Check() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

function ctaClass(v: "outline" | "primary" | "dark", disabled = false) {
  if (disabled) return "bg-brand-100 text-brand-700/70 cursor-not-allowed";
  if (v === "primary") return "bg-white text-brand-700 hover:bg-brand-50";
  if (v === "dark") return "bg-brand-900 text-white hover:bg-brand-800";
  return "bg-brand-600 hover:bg-brand-700 text-white";
}

export function PricingPlans({
  currentPlan,
  isAuthed,
}: {
  currentPlan: PlanId | null;
  isAuthed: boolean;
}) {
  const [openPlan, setOpenPlan] = useState<"pro" | "business" | null>(null);

  return (
    <>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5">
        {plans.map((p) => {
          const isCurrent = currentPlan === p.id;
          const highlight = p.highlight;

          let cta: React.ReactNode = null;
          if (isCurrent) {
            cta = (
              <div className={`mt-6 text-center rounded-full font-semibold px-5 py-3 text-sm ${ctaClass(p.variant, true)}`}>
                แพ็กเกจปัจจุบัน
              </div>
            );
          } else if (p.id === "enterprise") {
            cta = (
              <Link
                href="/#contact"
                className={`mt-6 text-center rounded-full font-semibold px-5 py-3 text-sm transition ${ctaClass(p.variant)}`}
              >
                {p.cta}
              </Link>
            );
          } else if (p.id === "starter") {
            cta = (
              <Link
                href={isAuthed ? "/dashboard" : "/signup"}
                className={`mt-6 text-center rounded-full font-semibold px-5 py-3 text-sm transition ${ctaClass(p.variant)}`}
              >
                {isAuthed ? "ใช้งาน Starter" : p.cta}
              </Link>
            );
          } else if (!isAuthed) {
            cta = (
              <Link
                href={`/login?next=/pricing`}
                className={`mt-6 text-center rounded-full font-semibold px-5 py-3 text-sm transition ${ctaClass(p.variant)}`}
              >
                {p.cta}
              </Link>
            );
          } else {
            cta = (
              <button
                type="button"
                onClick={() => setOpenPlan(p.id as "pro" | "business")}
                className={`mt-6 rounded-full font-semibold px-5 py-3 text-sm transition ${ctaClass(p.variant)}`}
              >
                {p.cta}
              </button>
            );
          }

          return (
            <div
              key={p.id}
              className={`relative rounded-2xl p-6 flex flex-col ${
                highlight
                  ? "bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800 text-white shadow-2xl shadow-brand-700/30 xl:-my-2 xl:py-8"
                  : "bg-white border border-border shadow-sm"
              }`}
            >
              {p.badge && (
                <div
                  className={`absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full ${
                    highlight ? "bg-accent text-brand-900" : "bg-brand-100 text-brand-700"
                  }`}
                >
                  {p.badge}
                </div>
              )}
              {isCurrent && (
                <div className="absolute -top-3 right-4 text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-brand-900 text-white">
                  แพ็กเกจปัจจุบัน
                </div>
              )}

              <div className={`text-sm font-semibold ${highlight ? "text-white/85" : "text-brand-700"}`}>
                {p.name}
              </div>
              <div className={`mt-3 flex items-baseline gap-1 ${highlight ? "text-white" : "text-brand-800"}`}>
                <span className="text-4xl font-extrabold tracking-tight">{p.price}</span>
                {p.priceNote && (
                  <span className={`text-sm ${highlight ? "text-white/70" : "text-brand-900/55"}`}>
                    {p.priceNote}
                  </span>
                )}
              </div>

              <div className={`mt-4 text-xs font-semibold ${highlight ? "text-white/75" : "text-brand-900/55"}`}>
                เหมาะสำหรับ
              </div>
              <div className={`mt-1 text-sm ${highlight ? "text-white/85" : "text-brand-900/75"}`}>
                {p.audience.join(" • ")}
              </div>

              <ul className={`mt-5 space-y-2 text-sm flex-1 ${highlight ? "text-white/90" : "text-brand-900/80"}`}>
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span
                      className={`shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center ${
                        highlight ? "bg-white/15 text-white" : "bg-brand-50 text-brand-600"
                      }`}
                    >
                      <Check />
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {cta}
            </div>
          );
        })}
      </div>

      <UpgradeModal open={!!openPlan} plan={openPlan} onClose={() => setOpenPlan(null)} />
    </>
  );
}
