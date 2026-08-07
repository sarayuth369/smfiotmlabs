import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const displayName =
    (meta.full_name as string) || (meta.name as string) || user?.email?.split("@")[0] || "สมาชิก";
  const provider = user?.app_metadata?.provider ?? "email";

  return (
    <div>
      <section className="rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800 text-white p-8 sm:p-10 relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-72 h-72 rounded-full bg-brand-400/25 blur-3xl" />
        <div className="relative">
          <div className="text-white/80 text-sm">ยินดีต้อนรับกลับ 👋</div>
          <h1 className="mt-2 text-3xl sm:text-4xl font-bold">{displayName}</h1>
          <p className="mt-2 text-white/85 text-sm">
            อีเมล: {user?.email} • เข้าสู่ระบบผ่าน{" "}
            <span className="font-semibold capitalize">{provider}</span>
          </p>
        </div>
      </section>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-8">
        {[
          { t: "ฟาร์มของฉัน", d: "ยังไม่มีฟาร์มที่ผูกกับบัญชี", cta: "เพิ่มฟาร์ม" },
          { t: "อุปกรณ์ (SMF IoT Node)", d: "ยังไม่มีอุปกรณ์ที่เชื่อมต่อ", cta: "เพิ่มอุปกรณ์" },
          { t: "การแจ้งเตือน", d: "ตั้งค่า LINE Notify และเงื่อนไขการแจ้งเตือน", cta: "ตั้งค่า" },
        ].map((c) => (
          <div key={c.t} className="card p-6 flex flex-col">
            <div className="text-sm font-semibold text-brand-800">{c.t}</div>
            <p className="mt-1 text-sm text-brand-900/60 flex-1">{c.d}</p>
            <button
              type="button"
              className="mt-4 self-start rounded-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 transition"
            >
              {c.cta}
            </button>
          </div>
        ))}
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
