import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { PlanId } from "@/lib/plans";
import { PlanCard } from "./_components/PlanCard";
import { NotificationsPanel, type NotificationItem } from "./_components/NotificationsPanel";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, plan, plan_expires_at")
    .eq("id", user!.id)
    .single();

  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const displayName =
    profile?.full_name ||
    (meta.full_name as string) ||
    (meta.name as string) ||
    user?.email?.split("@")[0] ||
    "สมาชิก";
  const provider = user?.app_metadata?.provider ?? "email";
  const plan = ((profile?.plan as PlanId) ?? "starter") as PlanId;
  const expiresAt = (profile?.plan_expires_at as string | null) ?? null;

  const { data: notifs } = await supabase
    .from("notifications")
    .select("id, title, message, read_at, created_at")
    .eq("user_id", user!.id)
    .order("read_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false })
    .limit(20);
  const notifications = (notifs ?? []) as NotificationItem[];

  return (
    <div>
      <section className="rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800 text-white p-8 sm:p-10 relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-72 h-72 rounded-full bg-brand-400/25 blur-3xl" />
        <div className="relative">
          <div className="text-white/80 text-sm">ยินดีต้อนรับกลับ 👋</div>
          <h1 className="mt-2 text-3xl sm:text-4xl font-bold">{displayName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-white/85 text-sm">
            <span>อีเมล: {user?.email}</span>
            <span className="opacity-60">•</span>
            <span>เข้าสู่ระบบผ่าน <span className="font-semibold capitalize">{provider}</span></span>
            <Link
              href="/dashboard/account"
              className="inline-flex items-center gap-1.5 rounded-full bg-white/15 border border-white/25 hover:bg-white/25 px-3 py-1 text-xs font-semibold transition"
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21a8 8 0 0 1 16 0" />
              </svg>
              Account
            </Link>
          </div>

          <PlanCard plan={plan} expiresAt={expiresAt} />
        </div>
      </section>

      <NotificationsPanel items={notifications} />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-8">
        <div className="card p-6 flex flex-col">
          <div className="text-sm font-semibold text-brand-800">ฟาร์มของฉัน</div>
          <p className="mt-1 text-sm text-brand-900/60 flex-1">ยังไม่มีฟาร์มที่ผูกกับบัญชี</p>
          <button
            type="button"
            className="mt-4 self-start rounded-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 transition"
          >
            เพิ่มฟาร์ม
          </button>
        </div>

        <div className="card p-6 flex flex-col">
          <div className="text-sm font-semibold text-brand-800">อุปกรณ์ (SMF IoT Node)</div>
          <p className="mt-1 text-sm text-brand-900/60 flex-1">ยังไม่มีอุปกรณ์ที่เชื่อมต่อ</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 transition"
            >
              เพิ่มอุปกรณ์
            </button>
            <Link
              href="/iot-nodes"
              className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 hover:border-brand-400 text-brand-800 text-sm font-semibold px-4 py-2 transition"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2l1 4h11l-2 8H8L6 6H3" />
                <circle cx="9" cy="20" r="1.5" />
                <circle cx="17" cy="20" r="1.5" />
              </svg>
              สั่งซื้อ SMF IoT Node
            </Link>
            <Link
              href="/dashboard/orders"
              className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 hover:border-brand-400 text-brand-800 text-sm font-semibold px-4 py-2 transition"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              ตรวจสอบสถานะการสั่งซื้อ
            </Link>
          </div>
        </div>

        <div className="card p-6 flex flex-col">
          <div className="text-sm font-semibold text-brand-800">การแจ้งเตือน</div>
          <p className="mt-1 text-sm text-brand-900/60 flex-1">ตั้งค่า LINE Notify และเงื่อนไขการแจ้งเตือน</p>
          <button
            type="button"
            className="mt-4 self-start rounded-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 transition"
          >
            ตั้งค่า
          </button>
        </div>
      </div>

      <div className="mt-8 card p-6 sm:p-8">
        <h2 className="font-bold text-brand-800">ขั้นตอนถัดไป</h2>
        <ol className="mt-4 space-y-3 text-sm text-brand-900/80 list-decimal pl-5">
          <li>เพิ่มฟาร์มแรก และตั้งชื่อแปลง</li>
          <li>ผูกอุปกรณ์ SMF IoT Node กับฟาร์ม</li>
          <li>เลือกเซนเซอร์ที่ติดตั้งและกำหนดค่าเกณฑ์แจ้งเตือน</li>
          <li>เชื่อม LINE Notify เพื่อรับแจ้งเตือนทันที</li>
        </ol>
        <p className="mt-4 text-xs text-brand-900/50">
          ระบบด้านในกำลังพัฒนาต่อ — หน้านี้จะแสดงกราฟข้อมูลเรียลไทม์และการควบคุมอุปกรณ์เร็ว ๆ นี้
        </p>
      </div>
    </div>
  );
}
