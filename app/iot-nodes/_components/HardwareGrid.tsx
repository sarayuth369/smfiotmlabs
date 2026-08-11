"use client";

import Link from "next/link";
import { useState } from "react";
import type { SKU } from "@/lib/hardware";
import type { ProductRow } from "@/lib/catalog";
import { OrderModal } from "./OrderModal";

type Tier = "starter" | "best" | "pro" | "enterprise";

function badgeClass(t: Tier | null): string {
  switch (t) {
    case "best": return "bg-accent text-brand-900";
    case "pro": return "bg-brand-600 text-white";
    case "enterprise": return "bg-brand-900 text-white";
    default: return "bg-brand-100 text-brand-700";
  }
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

const INDUSTRIAL: ProductRow = {
  sku: "industrial_node" as unknown as SKU,
  name: "Industrial Node",
  price: 0,
  badge: "Enterprise",
  badge_tier: "enterprise",
  audience: ["โรงงาน", "Smart Agriculture", "Industrial"],
  specs: [
    "Industrial PLC","RS485","Modbus","LoRa","4G","Ethernet",
    "Waterproof IP65","Unlimited Sensors","Remote Management",
  ],
  sort_order: 999,
  is_active: true,
};

export function HardwareGrid({
  products,
  isAuthed,
}: {
  products: ProductRow[];
  isAuthed: boolean;
}) {
  const [openSku, setOpenSku] = useState<SKU | null>(null);
  const activeProducts = products.filter((p) => p.is_active);
  const all = [...activeProducts, INDUSTRIAL];

  return (
    <>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5">
        {all.map((n) => {
          const isIndustrial = n.sku === ("industrial_node" as unknown as SKU);
          const priceLabel = isIndustrial ? "Contact Sales" : `฿${n.price.toLocaleString()}`;

          let cta: React.ReactNode;
          if (isIndustrial) {
            cta = <Link href="/#contact" className="mt-6 text-center rounded-full bg-brand-900 hover:bg-brand-800 text-white font-semibold px-5 py-3 text-sm transition">Contact Sales</Link>;
          } else if (!isAuthed) {
            cta = <Link href={`/login?next=/iot-nodes`} className="mt-6 text-center rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-3 text-sm transition">Order Now</Link>;
          } else {
            cta = <button type="button" onClick={() => setOpenSku(n.sku)} className="mt-6 rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-3 text-sm transition">Order Now</button>;
          }

          return (
            <div key={n.sku} className="relative card p-6 flex flex-col">
              {n.badge && (
                <div className={`absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full ${badgeClass(n.badge_tier)}`}>
                  {n.badge}
                </div>
              )}

              <div className="mt-2 text-sm font-semibold text-brand-700">{n.name}</div>
              <div className="mt-2 flex items-baseline gap-1 text-brand-800">
                <span className="text-3xl font-extrabold tracking-tight">{priceLabel}</span>
              </div>

              {n.audience.length > 0 && (
                <>
                  <div className="mt-4 text-xs font-semibold text-brand-900/55">เหมาะสำหรับ</div>
                  <div className="text-sm text-brand-900/75 mt-1">{n.audience.join(" • ")}</div>
                </>
              )}

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
