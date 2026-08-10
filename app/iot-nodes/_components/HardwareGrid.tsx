"use client";

import Link from "next/link";
import { useState } from "react";
import type { SKU } from "@/lib/hardware";
import { OrderModal } from "./OrderModal";

type Tier = "starter" | "best" | "pro" | "enterprise";

type Node = {
  sku: SKU | null; // null = no self-serve order (Industrial)
  name: string;
  badge: string;
  badgeTier: Tier;
  price: string;
  audience: string[];
  specs: string[];
  ctaLabel: string;
  ctaHref?: string; // used when sku is null
};

const nodes: Node[] = [
  {
    sku: "starter_node",
    name: "Starter Node",
    badge: "Starter",
    badgeTier: "starter",
    price: "฿2,990",
    audience: ["ทดลองระบบ", "โรงเรือน", "ฟาร์มขนาดเล็ก"],
    specs: [
      "ESP32 Controller",
      "WiFi",
      "Temperature Sensor",
      "Humidity Sensor",
      "Relay 2 Channel",
      "Ready to use",
      "Cloud Ready",
    ],
    ctaLabel: "Order Now",
  },
  {
    sku: "pro_node",
    name: "Pro Node",
    badge: "Best Seller",
    badgeTier: "best",
    price: "฿4,990",
    audience: ["ฟาร์มทั่วไป", "Smart Farm"],
    specs: [
      "ESP32",
      "Temperature",
      "Humidity",
      "Soil Moisture",
      "Light Sensor",
      "Relay 4 Channel",
      "OTA Update",
      "Cloud Ready",
      "Mobile App",
    ],
    ctaLabel: "Order Now",
  },
  {
    sku: "complete_kit",
    name: "Complete Smart Farm Kit",
    badge: "Professional",
    badgeTier: "pro",
    price: "฿9,900",
    audience: ["ฟาร์มจริง", "ติดตั้งพร้อมใช้งาน"],
    specs: [
      "ESP32 Pro",
      "Soil Moisture",
      "Temperature",
      "Humidity",
      "Light",
      "Water Level",
      "Power Supply",
      "Waterproof Box",
      "Relay",
      "Ready Install",
    ],
    ctaLabel: "Order Now",
  },
  {
    sku: null,
    name: "Industrial Node",
    badge: "Enterprise",
    badgeTier: "enterprise",
    price: "Contact Sales",
    audience: ["โรงงาน", "Smart Agriculture", "Industrial"],
    specs: [
      "Industrial PLC",
      "RS485",
      "Modbus",
      "LoRa",
      "4G",
      "Ethernet",
      "Waterproof IP65",
      "Unlimited Sensors",
      "Remote Management",
    ],
    ctaLabel: "Contact Sales",
    ctaHref: "/#contact",
  },
];

function badgeClass(t: Tier) {
  switch (t) {
    case "best":
      return "bg-accent text-brand-900";
    case "pro":
      return "bg-brand-600 text-white";
    case "enterprise":
      return "bg-brand-900 text-white";
    default:
      return "bg-brand-100 text-brand-700";
  }
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

export function HardwareGrid({ isAuthed }: { isAuthed: boolean }) {
  const [openSku, setOpenSku] = useState<SKU | null>(null);

  return (
    <>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5">
        {nodes.map((n) => {
          let cta: React.ReactNode;
          if (n.sku === null) {
            cta = (
              <Link
                href={n.ctaHref!}
                className="mt-6 text-center rounded-full bg-brand-900 hover:bg-brand-800 text-white font-semibold px-5 py-3 text-sm transition"
              >
                {n.ctaLabel}
              </Link>
            );
          } else if (!isAuthed) {
            cta = (
              <Link
                href={`/login?next=/iot-nodes`}
                className="mt-6 text-center rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-3 text-sm transition"
              >
                {n.ctaLabel}
              </Link>
            );
          } else {
            cta = (
              <button
                type="button"
                onClick={() => setOpenSku(n.sku)}
                className="mt-6 rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-3 text-sm transition"
              >
                {n.ctaLabel}
              </button>
            );
          }

          return (
            <div key={n.name} className="relative card p-6 flex flex-col">
              <div
                className={`absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full ${badgeClass(
                  n.badgeTier
                )}`}
              >
                {n.badge}
              </div>

              <div className="mt-2 text-sm font-semibold text-brand-700">{n.name}</div>
              <div className="mt-2 flex items-baseline gap-1 text-brand-800">
                <span className="text-3xl font-extrabold tracking-tight">{n.price}</span>
              </div>

              <div className="mt-4 text-xs font-semibold text-brand-900/55">เหมาะสำหรับ</div>
              <div className="text-sm text-brand-900/75 mt-1">{n.audience.join(" • ")}</div>

              <div className="mt-5 text-xs font-semibold text-brand-900/55">Specifications</div>
              <ul className="mt-2 space-y-1.5 text-sm text-brand-900/80 flex-1">
                {n.specs.map((s) => (
                  <li key={s} className="flex items-start gap-2">
                    <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center">
                      <Check />
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>

              {cta}
            </div>
          );
        })}
      </div>

      <OrderModal open={!!openSku} sku={openSku} onClose={() => setOpenSku(null)} />
    </>
  );
}
