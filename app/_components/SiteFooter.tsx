import Image from "next/image";
import Link from "next/link";

function Facebook({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M13 22v-8h3l1-4h-4V7.5c0-1.1.4-2 2-2h2V2h-3c-3 0-5 1.8-5 5v3H6v4h3v8h4z" />
    </svg>
  );
}
function Line({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 3C6.5 3 2 6.6 2 11c0 4 3.6 7.3 8.4 7.9.3.1.7.2.8.5 0 .3-.1.7-.2 1l-.2 1c-.1.3 0 .7.4.5.4-.2 4.8-2.8 6.5-4.8C19.4 15.4 22 13.4 22 11c0-4.4-4.5-8-10-8zm-4 10H6.5v-4.6h-.7v-.5h2v.5h-.7V13zm2.4 0h-.6v-5h.6v5zm3.5 0h-.5l-1.6-2.6V13h-.6V8h.6l1.5 2.4V8h.6v5zm3.8-4.5h-1.5v.9h1.4v.5h-1.4v.9h1.5v.5h-2v-3.3h2v.5z" />
    </svg>
  );
}
export function SiteFooter() {
  return (
    <footer className="bg-brand-900 text-brand-100/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid md:grid-cols-4 gap-8">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center overflow-hidden">
              <Image src="/images/logo.png" alt="M Labs" width={36} height={36} className="object-contain" />
            </div>
            <div>
              <div className="font-bold text-white">SMF IoT</div>
              <div className="text-xs text-brand-200/70">by M Labs</div>
            </div>
          </div>
          <p className="mt-4 text-sm max-w-md leading-relaxed">
            เทคโนโลยีเกษตรอัจฉริยะที่พัฒนาโดยคนไทยเพื่อคนไทย — เพิ่มผลผลิต ลดต้นทุน สนับสนุนเกษตรกรทุกระดับ
          </p>
        </div>
        <div>
          <div className="text-white font-semibold mb-3">เมนู</div>
          <ul className="space-y-2 text-sm">
            <li><Link href="/#why" className="hover:text-white">ทำไมต้อง SMF IoT</Link></li>
            <li><Link href="/#how" className="hover:text-white">การทำงาน</Link></li>
            <li><Link href="/#features" className="hover:text-white">จุดเด่น</Link></li>
            <li><Link href="/#app" className="hover:text-white">SMF App</Link></li>
            <li><Link href="/pricing" className="hover:text-white">Pricing</Link></li>
            <li><Link href="/iot-nodes" className="hover:text-white">IoT Node Price</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-white font-semibold mb-3">ติดต่อเรา</div>
          <ul className="space-y-2 text-sm">
            <li>
              <a href="https://facebook.com/" className="flex items-center gap-2 hover:text-white transition">
                <Facebook /> smfiotbymlabs
              </a>
            </li>
            <li>
              <a href="https://line.me/" className="flex items-center gap-2 hover:text-white transition">
                <Line /> @smfiotmlabs
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 text-xs text-brand-200/60 flex flex-wrap items-center justify-between gap-3">
          <div>© {new Date().getFullYear()} SMF IoT by M Labs. All rights reserved.</div>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-white">Privacy Policy</Link>
            <span>Made with 🌱 in Thailand</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
