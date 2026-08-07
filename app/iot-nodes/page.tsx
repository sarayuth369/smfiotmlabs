import Link from "next/link";
import { SiteHeader } from "../_components/SiteHeader";
import { SiteFooter } from "../_components/SiteFooter";

type Tier = "starter" | "best" | "pro" | "enterprise";

const nodes: {
  name: string;
  badge: string;
  badgeTier: Tier;
  price: string;
  priceNote?: string;
  audience: string[];
  specs: string[];
  cta: { label: string; href: string };
}[] = [
  {
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
    cta: { label: "Order Now", href: "/login" },
  },
  {
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
    cta: { label: "Order Now", href: "/login" },
  },
  {
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
    cta: { label: "Order Now", href: "/login" },
  },
  {
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
    cta: { label: "Contact Sales", href: "/#contact" },
  },
];

const services = [
  {
    name: "Installation Service",
    priceLabel: "เริ่มต้น",
    price: "฿3,000",
    features: ["ติดตั้งอุปกรณ์", "ตั้งค่าระบบ", "ทดสอบการทำงาน", "สอนใช้งาน"],
    cta: { label: "Order Now", href: "/#contact" },
    accent: "🔧",
  },
  {
    name: "Annual Maintenance",
    priceLabel: "เริ่มต้น",
    price: "฿2,900",
    priceNote: "/ ปี",
    features: ["Remote Support", "Firmware Update", "Health Check", "Backup Configuration"],
    cta: { label: "Order Now", href: "/#contact" },
    accent: "🛠️",
  },
  {
    name: "AI Smart Farm",
    priceLabel: "",
    price: "฿699",
    priceNote: "/ เดือน",
    features: [
      "AI วิเคราะห์ข้อมูล",
      "แจ้งเตือนความผิดปกติ",
      "แนะนำการให้น้ำ",
      "วิเคราะห์อุณหภูมิ",
      "วิเคราะห์ความชื้น",
    ],
    comingSoon: true,
    cta: null,
    accent: "🤖",
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

export default function IotNodesPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="hero-bg py-16 sm:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <span className="chip">🔌 SMF IoT Hardware</span>
            <h1 className="mt-4 text-4xl sm:text-5xl font-extrabold text-brand-800 tracking-tight">
              SMF IoT Hardware
            </h1>
            <p className="mt-4 text-lg text-brand-900/70 max-w-2xl mx-auto">
              เลือกอุปกรณ์ที่เหมาะกับขนาดฟาร์มของคุณ ตั้งแต่ทดลองระบบจนถึงระดับอุตสาหกรรม
            </p>
          </div>
        </section>

        {/* IoT Node Cards */}
        <section className="py-14 sm:py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5">
              {nodes.map((n) => (
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

                  <Link
                    href={n.cta.href}
                    className="mt-6 text-center rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-3 text-sm transition"
                  >
                    {n.cta.label}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Additional Services */}
        <section className="section-bg-alt border-y border-brand-100 py-16 sm:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <span className="chip">✨ Additional Services</span>
              <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-brand-800 tracking-tight">
                Additional Services
              </h2>
              <p className="mt-3 text-brand-900/70 max-w-2xl mx-auto">
                บริการเสริมเพื่อให้ระบบของคุณทำงานได้ราบรื่นตลอดอายุการใช้งาน
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-5">
              {services.map((s) => (
                <div key={s.name} className="card p-6 flex flex-col relative">
                  {s.comingSoon && (
                    <div className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-brand-100 text-brand-700">
                      Coming Soon
                    </div>
                  )}
                  <div className="text-3xl">{s.accent}</div>
                  <div className="mt-3 font-bold text-brand-800">{s.name}</div>
                  <div className="mt-3 flex items-baseline gap-1 text-brand-800">
                    {s.priceLabel && <span className="text-xs text-brand-900/55">{s.priceLabel}</span>}
                    <span className="text-2xl font-extrabold tracking-tight ml-1">{s.price}</span>
                    {s.priceNote && <span className="text-sm text-brand-900/55">{s.priceNote}</span>}
                  </div>
                  <ul className="mt-4 space-y-1.5 text-sm text-brand-900/80 flex-1">
                    {s.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center">
                          <Check />
                        </span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  {s.cta ? (
                    <Link
                      href={s.cta.href}
                      className="mt-6 text-center rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-3 text-sm transition"
                    >
                      {s.cta.label}
                    </Link>
                  ) : (
                    <div className="mt-6 text-center rounded-full bg-brand-100 text-brand-700 font-semibold px-5 py-3 text-sm cursor-not-allowed">
                      เร็ว ๆ นี้
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
