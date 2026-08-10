import Link from "next/link";
import { SiteHeader } from "../_components/SiteHeader";
import { SiteFooter } from "../_components/SiteFooter";
import { HardwareGrid } from "./_components/HardwareGrid";
import { createClient } from "@/lib/supabase/server";

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
    cta: null as { label: string; href: string } | null,
    accent: "🤖",
  },
];

function Check() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

export default async function IotNodesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

        <section className="py-14 sm:py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <HardwareGrid isAuthed={!!user} />
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
