import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MobileMenu } from "./MobileMenu";

const NAV = [
  { href: "/#mission", label: "จุดประสงค์" },
  { href: "/#how", label: "การทำงาน" },
  { href: "/#features", label: "จุดเด่น" },
  { href: "/#sensors", label: "เซนเซอร์" },
  { href: "/#app", label: "SMF App" },
  { href: "/pricing", label: "Pricing" },
  { href: "/iot-nodes", label: "IoT Node Price" },
  { href: "/#contact", label: "ติดต่อ" },
];

export async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAuthed = !!user;

  return (
    <header className="sticky top-0 z-40 backdrop-blur bg-white/75 border-b border-brand-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="w-9 h-9 rounded-full bg-white border border-brand-200 flex items-center justify-center overflow-hidden">
            <Image src="/images/logo.png" alt="M Labs" width={36} height={36} className="object-contain" />
          </div>
          <div className="leading-tight">
            <div className="font-bold text-brand-800 text-lg">SMF IoT</div>
            <div className="text-[10px] text-brand-700/70 -mt-0.5">by M Labs</div>
          </div>
        </Link>

        <nav className="hidden lg:flex items-center gap-5 xl:gap-7 text-sm text-brand-900/80 font-medium">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-brand-600 whitespace-nowrap">
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {isAuthed ? (
            <Link
              href="/dashboard"
              className="hidden sm:inline-flex items-center gap-2 rounded-full bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-semibold transition whitespace-nowrap"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="9" rx="1" />
                <rect x="14" y="3" width="7" height="5" rx="1" />
                <rect x="14" y="12" width="7" height="9" rx="1" />
                <rect x="3" y="16" width="7" height="5" rx="1" />
              </svg>
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden sm:inline-flex items-center rounded-full border border-brand-200 hover:border-brand-400 text-brand-800 px-4 py-2 text-sm font-semibold transition whitespace-nowrap"
              >
                เข้าสู่ระบบ
              </Link>
              <Link
                href="/signup"
                className="hidden sm:inline-flex items-center gap-2 rounded-full bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-semibold transition whitespace-nowrap"
              >
                สมัครสมาชิก
              </Link>
            </>
          )}
          <MobileMenu nav={NAV} isAuthed={isAuthed} />
        </div>
      </div>
    </header>
  );
}
