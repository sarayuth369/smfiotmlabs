import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left: brand panel */}
      <aside className="relative hidden lg:flex flex-col justify-between p-10 text-white overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800">
        <div className="absolute -top-24 -left-16 w-96 h-96 rounded-full bg-brand-400/30 blur-3xl" />
        <div className="absolute -bottom-24 -right-16 w-96 h-96 rounded-full bg-brand-300/20 blur-3xl" />

        <Link href="/" className="relative flex items-center gap-3 w-fit">
          <div className="w-11 h-11 rounded-full bg-white/10 border border-white/25 flex items-center justify-center overflow-hidden">
            <Image src="/images/logo.png" alt="M Labs" width={44} height={44} className="object-contain" />
          </div>
          <div>
            <div className="text-xl font-bold">SMF IoT</div>
            <div className="text-xs opacity-80 -mt-0.5">by M Labs</div>
          </div>
        </Link>

        <div className="relative">
          <h2 className="text-3xl xl:text-4xl font-bold leading-tight">
            เกษตรอัจฉริยะ<br />เพื่อผลผลิตที่ยั่งยืน
          </h2>
          <p className="mt-4 text-white/85 max-w-md">
            เข้าใช้งานแดชบอร์ด SMF App ควบคุมอุปกรณ์ ดูข้อมูลเรียลไทม์ และรับแจ้งเตือนจากฟาร์มของคุณได้ทันที
          </p>

          <ul className="mt-8 space-y-3">
            {[
              "ตรวจสอบข้อมูลฟาร์มเรียลไทม์ 24/7",
              "ควบคุมอุปกรณ์ผ่านมือถือทุกที่",
              "แจ้งเตือนอัตโนมัติผ่าน LINE",
              "รองรับหลายแปลงในบัญชีเดียว",
            ].map((t) => (
              <li key={t} className="flex items-center gap-3 text-white/90">
                <span className="w-6 h-6 rounded-full bg-white/15 border border-white/25 flex items-center justify-center text-xs">✓</span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative text-xs text-white/60">
          © {new Date().getFullYear()} SMF IoT by M Labs
        </div>
      </aside>

      {/* Right: form */}
      <main className="flex flex-col">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center justify-between p-4 border-b border-brand-100 bg-white">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/images/logo.png" alt="M Labs" width={32} height={32} className="object-contain" />
            <span className="font-bold text-brand-800">SMF IoT</span>
          </Link>
          <Link href="/" className="text-sm text-brand-700 hover:text-brand-900">← หน้าแรก</Link>
        </div>

        <div className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-[var(--background)]">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </main>
    </div>
  );
}
