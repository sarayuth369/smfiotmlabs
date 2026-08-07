import Link from "next/link";
import { SiteHeader } from "../_components/SiteHeader";
import { SiteFooter } from "../_components/SiteFooter";

const plans = [
  {
    name: "Starter",
    badge: "Recommended for Beginners",
    price: "ฟรี",
    priceNote: "",
    cta: "Start Free",
    href: "/login",
    variant: "outline" as const,
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
    name: "Pro",
    badge: "Most Popular",
    price: "฿499",
    priceNote: "/ เดือน",
    cta: "Upgrade to Pro",
    href: "/login",
    variant: "primary" as const,
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
    name: "Business",
    badge: null,
    price: "฿899",
    priceNote: "/ เดือน",
    cta: "Choose Business",
    href: "/login",
    variant: "outline" as const,
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
    name: "Enterprise",
    badge: null,
    price: "Contact Sales",
    priceNote: "",
    cta: "Contact Sales",
    href: "/#contact",
    variant: "dark" as const,
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

function ctaClass(v: "outline" | "primary" | "dark") {
  if (v === "primary") return "bg-white text-brand-700 hover:bg-brand-50";
  if (v === "dark") return "bg-brand-900 text-white hover:bg-brand-800";
  return "bg-brand-600 hover:bg-brand-700 text-white";
}

export default function PricingPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="hero-bg py-16 sm:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <span className="chip">💰 Simple & Transparent</span>
            <h1 className="mt-4 text-4xl sm:text-5xl font-extrabold text-brand-800 tracking-tight">
              Simple, Transparent Pricing
            </h1>
            <p className="mt-4 text-lg text-brand-900/70 max-w-2xl mx-auto">
              เลือกแพ็กเกจที่เหมาะกับฟาร์มของคุณ เริ่มใช้ฟรี และอัปเกรดเมื่อธุรกิจของคุณเติบโต
            </p>
          </div>
        </section>

        <section className="py-14 sm:py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5">
              {plans.map((p) => {
                const highlight = p.highlight;
                return (
                  <div
                    key={p.name}
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

                    <Link
                      href={p.href}
                      className={`mt-6 text-center rounded-full font-semibold px-5 py-3 text-sm transition ${ctaClass(p.variant)}`}
                    >
                      {p.cta}
                    </Link>
                  </div>
                );
              })}
            </div>

            <div className="mt-14 rounded-3xl bg-gradient-to-br from-brand-50 to-white border border-brand-100 p-8 sm:p-10 text-center">
              <h3 className="text-xl sm:text-2xl font-bold text-brand-800">Need a custom solution?</h3>
              <p className="mt-2 text-brand-900/70 max-w-2xl mx-auto">
                Our team can design a complete Smart Farm Platform specifically for your business.
              </p>
              <Link
                href="/#contact"
                className="mt-5 inline-flex rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-3 transition"
              >
                Contact Sales
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
