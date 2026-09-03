import Image from "next/image";
import { SiteHeader } from "./_components/SiteHeader";
import { SiteFooter } from "./_components/SiteFooter";

/* ---------- Icons (inline SVG so we don't add deps) ---------- */

type IconProps = { className?: string };

const I = {
  Leaf: ({ className = "w-5 h-5" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M11 20A7 7 0 0 1 4 13V4h9a7 7 0 0 1 7 7v9" />
      <path d="M11 20c0-6 4-10 9-10" />
    </svg>
  ),
  Chart: ({ className = "w-5 h-5" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" />
    </svg>
  ),
  Drop: ({ className = "w-5 h-5" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />
    </svg>
  ),
  Phone: ({ className = "w-5 h-5" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="6" y="2" width="12" height="20" rx="2" /><path d="M11 18h2" />
    </svg>
  ),
  Bell: ({ className = "w-5 h-5" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  ),
  Cloud: ({ className = "w-5 h-5" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17.5 19a4.5 4.5 0 1 0-1.5-8.7A6 6 0 0 0 4 12.5 4.5 4.5 0 0 0 6.5 21h11z" />
    </svg>
  ),
  Cpu: ({ className = "w-5 h-5" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="6" y="6" width="12" height="12" rx="2" /><rect x="9" y="9" width="6" height="6" rx="1" />
      <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
    </svg>
  ),
  Wifi: ({ className = "w-5 h-5" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 8.5a15 15 0 0 1 20 0" /><path d="M5 12a10 10 0 0 1 14 0" /><path d="M8.5 15.5a5 5 0 0 1 7 0" /><circle cx="12" cy="19" r="1" />
    </svg>
  ),
  Wrench: ({ className = "w-5 h-5" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2.4-2.4z" />
    </svg>
  ),
  Sun: ({ className = "w-5 h-5" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </svg>
  ),
  Check: ({ className = "w-4 h-4" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12l5 5L20 7" />
    </svg>
  ),
  Thermo: ({ className = "w-5 h-5" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 4a2 2 0 1 0-4 0v10.5a4 4 0 1 0 4 0V4z" />
    </svg>
  ),
  Bolt: ({ className = "w-5 h-5" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
    </svg>
  ),
  Book: ({ className = "w-5 h-5" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 4h11a4 4 0 0 1 4 4v12H7a3 3 0 0 1-3-3V4z" /><path d="M4 17a3 3 0 0 1 3-3h12" />
    </svg>
  ),
  Lock: ({ className = "w-5 h-5" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  ),
  Database: ({ className = "w-5 h-5" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </svg>
  ),
  Facebook: ({ className = "w-5 h-5" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M13 22v-8h3l1-4h-4V7.5c0-1.1.4-2 2-2h2V2h-3c-3 0-5 1.8-5 5v3H6v4h3v8h4z" />
    </svg>
  ),
  Line: ({ className = "w-5 h-5" }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 3C6.5 3 2 6.6 2 11c0 4 3.6 7.3 8.4 7.9.3.1.7.2.8.5 0 .3-.1.7-.2 1l-.2 1c-.1.3 0 .7.4.5.4-.2 4.8-2.8 6.5-4.8C19.4 15.4 22 13.4 22 11c0-4.4-4.5-8-10-8zm-4 10H6.5v-4.6h-.7v-.5h2v.5h-.7V13zm2.4 0h-.6v-5h.6v5zm3.5 0h-.5l-1.6-2.6V13h-.6V8h.6l1.5 2.4V8h.6v5zm3.8-4.5h-1.5v.9h1.4v.5h-1.4v.9h1.5v.5h-2v-3.3h2v.5z" />
    </svg>
  ),
};

/* ---------- Data ---------- */

// Section 2 — Why SMF IoT (4 key points)
const whyPoints = [
  { icon: <I.Leaf />, title: "Designed for Thai Agriculture", desc: "ออกแบบให้เข้าใจบริบทการเกษตรไทย ใช้งานง่าย ไม่ซับซ้อน" },
  { icon: <I.Cpu />, title: "Start Small, Scale Easily", desc: "เริ่มจากอุปกรณ์พื้นฐาน แล้วต่อยอดเพิ่มเซนเซอร์และฟังก์ชันได้ตามต้องการ" },
  { icon: <I.Cloud />, title: "One Connected Platform", desc: "เชื่อมต่ออุปกรณ์ แอป และข้อมูลไว้ในระบบเดียว จัดการง่าย ไม่กระจัดกระจาย" },
  { icon: <I.Check />, title: "Built for Real Use", desc: "ผ่านการพัฒนาและทดสอบเพื่อใช้งานได้จริงในภาคสนาม ไม่ใช่แค่ต้นแบบ" },
];

// Section 4 — Core Capabilities (merged Highlights + Benefits)
const capabilities = [
  { icon: <I.Chart />, title: "Real-time Monitoring", desc: "ตรวจสอบข้อมูลฟาร์มแบบเรียลไทม์ได้ทุกที่ทุกเวลา" },
  { icon: <I.Phone />, title: "Mobile Control", desc: "ควบคุมอุปกรณ์ทั้งหมดผ่านแอปเดียวบนมือถือ" },
  { icon: <I.Bolt />, title: "Smart Automation", desc: "ตั้งเงื่อนไขสั่งงานอัตโนมัติ ลดภาระงานประจำวัน" },
  { icon: <I.Bell />, title: "Instant Alerts", desc: "แจ้งเตือนทันทีเมื่อค่าผิดปกติ ผ่านแอปและ LINE" },
  { icon: <I.Book />, title: "Historical Data", desc: "บันทึกและย้อนดูข้อมูลย้อนหลังเพื่อวิเคราะห์แนวโน้ม" },
  { icon: <I.Cpu />, title: "Expandable System", desc: "ออกแบบเป็นโมดูล เพิ่มเซนเซอร์และอุปกรณ์ได้ตามต้องการ" },
];

// Section 5 — Supported sensors, grouped for readability
const sensorGroups = [
  {
    group: "Environment",
    items: [
      { icon: <I.Thermo />, label: "อุณหภูมิอากาศ", en: "Temperature" },
      { icon: <I.Drop />, label: "ความชื้นอากาศ", en: "Humidity" },
      { icon: <I.Sun />, label: "แสงสว่าง", en: "Lux" },
      { icon: <I.Cloud />, label: "ปริมาณน้ำฝน", en: "Rain" },
    ],
  },
  {
    group: "Soil",
    items: [
      { icon: <I.Leaf />, label: "ความชื้นดิน", en: "Soil Moisture" },
      { icon: <I.Leaf />, label: "ค่า NPK ในดิน", en: "NPK" },
      { icon: <I.Drop />, label: "ค่าความเป็นกรด-ด่าง", en: "pH" },
    ],
  },
  {
    group: "Water",
    items: [
      { icon: <I.Drop />, label: "ระดับน้ำ", en: "Water Level" },
      { icon: <I.Bolt />, label: "ค่าการนำไฟฟ้า", en: "EC" },
    ],
  },
  {
    group: "Energy",
    items: [{ icon: <I.Bolt />, label: "พลังงานไฟฟ้า", en: "Voltage / Current" }],
  },
];

// Section 6 — SMF App highlights
const appFeatures = [
  { icon: <I.Chart />, t: "แดชบอร์ดเรียลไทม์" },
  { icon: <I.Book />, t: "กราฟย้อนหลัง" },
  { icon: <I.Phone />, t: "ควบคุมอุปกรณ์" },
  { icon: <I.Bell />, t: "แจ้งเตือนอัตโนมัติ" },
];

// Section 7 — SMF Ecosystem
const ecosystem = [
  { t: "SMF IoT Node", d: "อุปกรณ์เก็บข้อมูลและควบคุมภาคสนาม", future: false },
  { t: "SMF Cloud", d: "จัดเก็บและประมวลผลข้อมูลบนคลาวด์อย่างปลอดภัย", future: false },
  { t: "SMF App", d: "แอปพลิเคชันสำหรับติดตามและควบคุมฟาร์ม", future: false },
  { t: "SMF Analytics", d: "วิเคราะห์ข้อมูลเชิงลึกเพื่อสนับสนุนการตัดสินใจ", future: false },
  { t: "SMF AI", d: "ระบบ AI ช่วยวิเคราะห์และแนะนำการเพาะปลูก", future: false },
];

// Section 7 — Technology stack actually used by the system
const tech = [
  { name: "ESP32", icon: <I.Cpu /> },
  { name: "Wi-Fi", icon: <I.Wifi /> },
  { name: "MQTT", icon: <I.Bolt /> },
  { name: "Secure Cloud", icon: <I.Lock /> },
  { name: "Supabase", icon: <I.Database /> },
  { name: "Flutter", icon: <I.Phone /> },
  { name: "LINE Integration", icon: <I.Line /> },
  { name: "OTA Update", icon: <I.Cloud /> },
];

// Section 8 — Use cases (merged Target + Use cases)
const usecases = [
  { emoji: "🌾", label: "นาและพืชไร่" },
  { emoji: "🌳", label: "สวนผลไม้" },
  { emoji: "🥬", label: "โรงเรือนและผัก" },
  { emoji: "💧", label: "ระบบน้ำและปั๊ม" },
  { emoji: "🐄", label: "ฟาร์มสัตว์ / สัตว์น้ำ" },
  { emoji: "🏫", label: "โรงเรียนและศูนย์เรียนรู้" },
  { emoji: "🏢", label: "ธุรกิจและโครงการ Smart Agriculture" },
];

/* ---------- Small building blocks ---------- */

function SectionHeading({
  eyebrow,
  title,
  desc,
  center = true,
}: {
  eyebrow?: string;
  title: string;
  desc?: string;
  center?: boolean;
}) {
  return (
    <div className={`${center ? "text-center mx-auto" : ""} max-w-3xl mb-12`}>
      {eyebrow && (
        <span className="chip mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
          {eyebrow}
        </span>
      )}
      <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-brand-800 tracking-tight leading-tight">
        {title}
      </h2>
      {desc && <p className="mt-4 text-base sm:text-lg text-brand-900/70">{desc}</p>}
    </div>
  );
}

function Stat({ v, l }: { v: string; l: string }) {
  return (
    <div className="text-center">
      <div className="text-3xl sm:text-4xl font-bold text-brand-700">{v}</div>
      <div className="text-sm text-brand-900/60 mt-1">{l}</div>
    </div>
  );
}

/* ---------- Page ---------- */

export default function Home() {
  return (
    <>
      <SiteHeader />

      <main>
        {/* ============ 1. HERO ============ */}
        <section className="hero-bg relative overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 sm:pt-20 pb-16 sm:pb-24 grid lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-7">
              <span className="chip">
                <I.Leaf className="w-4 h-4" /> เกษตรอัจฉริยะ • Agriculture 4.0
              </span>
              <h1 className="mt-5 text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-brand-800 leading-[1.05]">
                SMF <span className="text-brand-500">IoT</span>
                <span className="block text-2xl sm:text-3xl md:text-4xl font-semibold text-brand-700 mt-3">
                  Smart Farm Internet of Things
                </span>
              </h1>
              <p className="mt-5 text-lg text-brand-900/75 max-w-xl">
                เกษตรอัจฉริยะเพื่อผลผลิตที่ยั่งยืน — <span className="italic text-brand-700">“Smart Data, Better Harvest.”</span>
                <br />
                ระบบครบวงจรด้วย ESP32 + Cloud + Mobile App เพิ่มผลผลิต ลดต้นทุน ควบคุมได้จากทุกที่
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#contact" className="inline-flex items-center gap-2 rounded-full bg-brand-600 hover:bg-brand-700 text-white px-6 py-3 font-semibold shadow-lg shadow-brand-600/20 transition">
                  เริ่มต้นใช้งาน
                </a>
                <a href="#how" className="inline-flex items-center gap-2 rounded-full bg-white border border-brand-200 text-brand-800 hover:border-brand-400 px-6 py-3 font-semibold transition">
                  ดูวิธีการทำงาน
                </a>
              </div>

              {/* Quick benefits */}
              <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { icon: <I.Chart />, t: "เพิ่มผลผลิต", s: "ด้วยข้อมูลจริง" },
                  { icon: <I.Cpu />, t: "ลดต้นทุน", s: "น้ำ ปุ๋ย พลังงาน" },
                  { icon: <I.Phone />, t: "ควบคุมง่าย", s: "ผ่านมือถือ" },
                  { icon: <I.Bell />, t: "แจ้งเตือน", s: "ทันทีทุกกรณี" },
                ].map((b) => (
                  <div key={b.t} className="card p-4">
                    <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                      {b.icon}
                    </div>
                    <div className="mt-3 font-semibold text-brand-800 text-sm">{b.t}</div>
                    <div className="text-xs text-brand-900/60">{b.s}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hero image / CEO card */}
            <div className="lg:col-span-5">
              <div className="relative mx-auto max-w-md">
                <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-brand-200/60 to-brand-500/20 blur-2xl" />
                <div className="relative rounded-[2rem] bg-white border border-brand-100 shadow-xl shadow-brand-900/5 p-6">
                  <div className="relative aspect-[4/5] w-full rounded-2xl overflow-hidden bg-gradient-to-b from-brand-50 to-white">
                    <Image
                      src="/images/me.png"
                      alt="CEO — M Labs"
                      fill
                      className="object-contain object-bottom"
                      priority
                    />
                    <div className="absolute top-3 left-3 chip bg-white/90 backdrop-blur border-white shadow">
                      <span className="w-2 h-2 rounded-full bg-brand-500 pulse-ring" /> Online
                    </div>
                    <a
                      href="#contact"
                      className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-semibold shadow-lg shadow-brand-900/20 transition"
                    >
                      <I.Line className="w-4 h-4" /> ปรึกษาฟรี
                    </a>
                  </div>
                  <div className="mt-5">
                    <div className="text-xs text-brand-700/70 font-medium">CEO & Founder</div>
                    <div className="text-lg font-bold text-brand-800">M Labs</div>
                    <p className="mt-2 text-sm text-brand-900/70 leading-relaxed">
                      “เทคโนโลยีที่เข้าใจเกษตรกรไทย พัฒนาเพื่อเกษตรกรไทย”
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats strip */}
          <div className="border-t border-brand-100 bg-white/70 backdrop-blur">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-2 md:grid-cols-4 gap-6">
              <Stat v="10+" l="เซนเซอร์ที่รองรับ" />
              <Stat v="24/7" l="ตรวจสอบระบบ" />
              <Stat v="Real-time" l="ข้อมูลและการแจ้งเตือน" />
              <Stat v="100%" l="พัฒนาเพื่อเกษตรกรไทย" />
            </div>
          </div>
        </section>

        {/* ============ 2. WHY SMF IOT (incl. Mission) ============ */}
        <section id="why" className="py-20 sm:py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Why SMF IoT"
              title="Why SMF IoT?"
              desc="เทคโนโลยี Smart Farm ที่ออกแบบให้เริ่มต้นง่าย ใช้งานจริง และขยายไปพร้อมกับฟาร์มของคุณ"
            />
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {whyPoints.map((w) => (
                <div key={w.title} className="card p-6">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center shadow-md shadow-brand-600/20">
                    {w.icon}
                  </div>
                  <div className="mt-4 font-semibold text-brand-800">{w.title}</div>
                  <p className="text-sm text-brand-900/65 mt-1">{w.desc}</p>
                </div>
              ))}
            </div>
            <p className="mt-10 text-center text-lg sm:text-xl font-semibold text-brand-700 italic max-w-2xl mx-auto">
              “ทำให้เทคโนโลยี Smart Farm เข้าถึงง่าย ใช้งานได้จริง และเติบโตไปพร้อมกับฟาร์มของคุณ”
            </p>
          </div>
        </section>

        {/* ============ 3. HOW IT WORKS ============ */}
        <section id="how" className="section-bg-alt py-20 sm:py-24 border-y border-brand-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="How it works"
              title="ระบบทำงานอย่างไร?"
              desc="เก็บข้อมูลจากเซนเซอร์ → ส่งผ่าน SMF IoT Node → ประมวลผลบน Cloud → แสดง/ควบคุมผ่าน SMF App"
            />
            <div className="grid md:grid-cols-4 gap-6 relative">
              {[
                { n: "01", icon: <I.Leaf className="w-7 h-7" />, t: "Sensors", d: "อ่านค่าจากแปลง ทั้งดิน อากาศ น้ำ พลังงาน" },
                { n: "02", icon: <I.Cpu className="w-7 h-7" />, t: "SMF IoT Node", d: "อุปกรณ์กลาง ESP32 รับ-ส่งข้อมูล + ควบคุม" },
                { n: "03", icon: <I.Cloud className="w-7 h-7" />, t: "Internet / Cloud", d: "เก็บและวิเคราะห์ข้อมูลปลอดภัยบนคลาวด์" },
                { n: "04", icon: <I.Phone className="w-7 h-7" />, t: "SMF App", d: "แสดงผล / แจ้งเตือน / สั่งงานผ่านมือถือ" },
              ].map((s) => (
                <div key={s.n} className="card p-6 relative">
                  <div className="absolute -top-3 -right-3 bg-brand-600 text-white text-xs font-bold rounded-full w-9 h-9 flex items-center justify-center shadow">
                    {s.n}
                  </div>
                  <div className="w-14 h-14 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                    {s.icon}
                  </div>
                  <div className="mt-4 font-bold text-brand-800 text-lg">{s.t}</div>
                  <p className="text-sm text-brand-900/70 mt-1 leading-relaxed">{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ 4. CORE CAPABILITIES ============ */}
        <section id="features" className="py-20 sm:py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Core Capabilities"
              title="ความสามารถหลักของระบบ"
              desc="ฟีเจอร์สำคัญที่ช่วยให้บริหารฟาร์มได้ง่ายขึ้นในทุกวัน"
            />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {capabilities.map((c) => (
                <div key={c.title} className="card p-6">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center shadow-md shadow-brand-600/20">
                    {c.icon}
                  </div>
                  <div className="mt-4 font-semibold text-brand-800">{c.title}</div>
                  <p className="text-sm text-brand-900/65 mt-1">{c.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ 5. SUPPORTED SENSORS ============ */}
        <section id="sensors" className="section-bg-alt border-y border-brand-100 py-20 sm:py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-12 gap-10">
            <div className="lg:col-span-5">
              <SectionHeading
                eyebrow="Sensors"
                title="เซนเซอร์ที่รองรับ"
                desc="รองรับเซนเซอร์หลากหลาย ครอบคลุมทุกมิติของฟาร์มอัจฉริยะ จัดกลุ่มตามการใช้งาน"
                center={false}
              />
              <div className="chip">
                <I.Bolt className="w-4 h-4" /> รองรับการขยายระบบเพิ่มเซนเซอร์ในอนาคต
              </div>
            </div>
            <div className="lg:col-span-7 space-y-6">
              {sensorGroups.map((g) => (
                <div key={g.group}>
                  <div className="text-xs font-bold uppercase tracking-wide text-brand-700/70 mb-2">{g.group}</div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {g.items.map((s) => (
                      <div key={s.en} className="card p-4 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                          {s.icon}
                        </div>
                        <div>
                          <div className="font-semibold text-brand-800 text-sm">{s.label}</div>
                          <div className="text-xs text-brand-900/55">{s.en}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ 6. SMF APP ============ */}
        <section id="app" className="py-20 sm:py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <SectionHeading
                eyebrow="SMF App"
                title="ใช้งานง่าย ครบทุกฟังก์ชัน"
                desc="แดชบอร์ดครบทุกด้าน — เห็นข้อมูลแบบเรียลไทม์ กราฟย้อนหลัง ควบคุมอุปกรณ์ และรับแจ้งเตือนอัตโนมัติผ่านแอปเดียว"
                center={false}
              />
              <div className="grid sm:grid-cols-2 gap-4">
                {appFeatures.map((f) => (
                  <div key={f.t} className="card p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-brand-600 text-white flex items-center justify-center">
                      {f.icon}
                    </div>
                    <div className="font-semibold text-brand-800">{f.t}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Phone mockup */}
            <div className="relative mx-auto">
              <div className="absolute -inset-8 bg-gradient-to-tr from-brand-300/40 to-brand-600/20 rounded-[3rem] blur-2xl" />
              <div className="relative w-[280px] sm:w-[320px] h-[600px] rounded-[3rem] bg-brand-900 p-3 shadow-2xl animate-float">
                <div className="w-full h-full rounded-[2.4rem] bg-white overflow-hidden flex flex-col">
                  <div className="px-5 pt-5 pb-3 flex items-center justify-between text-brand-800">
                    <div className="text-sm font-semibold">SMF Farm 01</div>
                    <div className="text-xs text-brand-700/60">9:41</div>
                  </div>
                  <div className="px-4 grid grid-cols-2 gap-3">
                    {[
                      { l: "อุณหภูมิ", v: "27.6°C", icon: <I.Thermo />, c: "text-orange-500" },
                      { l: "ความชื้นอากาศ", v: "65%", icon: <I.Drop />, c: "text-sky-500" },
                      { l: "ความชื้นดิน", v: "42%", icon: <I.Leaf />, c: "text-brand-600" },
                      { l: "pH", v: "6.5", icon: <I.Drop />, c: "text-emerald-600" },
                      { l: "EC", v: "1.23 mS/cm", icon: <I.Bolt />, c: "text-amber-500" },
                      { l: "NPK", v: "120/45/60", icon: <I.Leaf />, c: "text-brand-700" },
                    ].map((s) => (
                      <div key={s.l} className="rounded-2xl border border-brand-100 p-3 bg-brand-50/40">
                        <div className={`${s.c} w-6 h-6`}>{s.icon}</div>
                        <div className="mt-1 text-[10px] text-brand-900/60 leading-tight">{s.l}</div>
                        <div className="text-sm font-bold text-brand-800">{s.v}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 mx-4 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white p-4">
                    <div className="text-xs opacity-80">Water Level</div>
                    <div className="text-2xl font-bold">70%</div>
                    <div className="mt-2 h-2 rounded-full bg-white/20 overflow-hidden">
                      <div className="h-full bg-brand-300" style={{ width: "70%" }} />
                    </div>
                  </div>
                  <div className="mt-auto mx-3 mb-3 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-around py-3 text-[10px] text-brand-800/70">
                    <div className="flex flex-col items-center gap-1 text-brand-700 font-semibold">
                      <I.Chart className="w-4 h-4" />Dashboard
                    </div>
                    <div className="flex flex-col items-center gap-1"><I.Chart className="w-4 h-4" />Graph</div>
                    <div className="flex flex-col items-center gap-1"><I.Phone className="w-4 h-4" />Control</div>
                    <div className="flex flex-col items-center gap-1"><I.Book className="w-4 h-4" />History</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ 7. SMF ECOSYSTEM / TECHNOLOGY ============ */}
        <section id="ecosystem" className="section-bg-alt border-y border-brand-100 py-20 sm:py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Ecosystem & Technology"
              title="แพลตฟอร์มและเทคโนโลยีเบื้องหลัง SMF IoT"
              desc="ระบบนิเวศครบวงจร สร้างบนเทคโนโลยีที่พิสูจน์แล้ว มั่นคง ปลอดภัย และต่อยอดได้"
            />

            <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4 items-stretch">
              {ecosystem.map((p) => (
                <div
                  key={p.t}
                  className={`card p-6 flex flex-col relative ${p.future ? "opacity-80" : ""}`}
                >
                  {p.future && (
                    <span className="absolute top-3 right-3 chip bg-amber-50 text-amber-700 border-amber-200 text-[11px]">
                      Coming in Future
                    </span>
                  )}
                  <div className="w-10 h-10 rounded-lg bg-brand-600 text-white flex items-center justify-center">
                    <I.Leaf />
                  </div>
                  <div className="mt-4 font-bold text-brand-800">{p.t}</div>
                  <p className="text-sm text-brand-900/65 mt-1">{p.d}</p>
                </div>
              ))}
            </div>

            <div className="mt-14">
              <div className="text-xs font-bold uppercase tracking-wide text-brand-700/70 mb-4 text-center">
                เทคโนโลยีที่ใช้งาน
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
                {tech.map((t) => (
                  <div key={t.name} className="card p-4 flex flex-col items-center gap-2 text-center">
                    <div className="w-11 h-11 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center">
                      {t.icon}
                    </div>
                    <div className="text-xs font-semibold text-brand-800">{t.name}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ============ 8. USE CASES ============ */}
        <section className="py-20 sm:py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="Use Cases"
              title="เหมาะกับใคร"
              desc="ระบบ SMF IoT ออกแบบให้ปรับใช้ได้หลากหลายพื้นที่และรูปแบบการเกษตร"
            />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {usecases.map((u) => (
                <div key={u.label} className="card p-5 text-center">
                  <div className="text-4xl">{u.emoji}</div>
                  <div className="mt-2 text-sm font-semibold text-brand-800">{u.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ 9. FINAL CTA ============ */}
        <section id="contact" className="pb-20 sm:pb-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800 text-white p-10 sm:p-14">
              <div className="absolute -right-24 -top-24 w-80 h-80 rounded-full bg-brand-400/30 blur-3xl" />
              <div className="absolute -left-16 -bottom-16 w-72 h-72 rounded-full bg-brand-300/20 blur-3xl" />
              <div className="relative grid lg:grid-cols-2 gap-8 items-center">
                <div>
                  <span className="chip bg-white/15 text-white border-white/20">
                    <I.Leaf className="w-4 h-4" /> พร้อมเริ่มต้นแล้วหรือยัง?
                  </span>
                  <h3 className="mt-4 text-3xl sm:text-4xl font-bold leading-tight">
                    เริ่มต้น Smart Farm ในแบบของคุณ
                  </h3>
                  <p className="mt-3 text-white/85 max-w-lg">
                    ให้ทีม SMF IoT ช่วยประเมินและออกแบบระบบให้เหมาะกับฟาร์มของคุณ
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 lg:justify-end">
                  <a
                    href="https://line.me/"
                    className="inline-flex items-center gap-2 rounded-full bg-white text-brand-700 px-6 py-3 font-semibold hover:bg-brand-50 transition"
                  >
                    <I.Line /> LINE: @smfiotmlabs
                  </a>
                  <a
                    href="https://facebook.com/"
                    className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/30 text-white px-6 py-3 font-semibold hover:bg-white/20 transition"
                  >
                    <I.Facebook /> smfiotbymlabs
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
