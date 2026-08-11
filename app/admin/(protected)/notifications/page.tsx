import { createAdminClient } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/admin/current";
import { getLineSettings } from "@/lib/admin/settings";
import { sendAnnouncement, deleteAnnouncement } from "./actions";

type Announcement = {
  id: string;
  title: string;
  message: string;
  target_plans: string[];
  channels: string[];
  status: string;
  line_error: string | null;
  web_recipients_count: number | null;
  created_at: string;
};

const PLAN_OPTIONS = [
  { value: "all", label: "All Users" },
  { value: "starter", label: "Starter" },
  { value: "pro", label: "Pro" },
  { value: "business", label: "Business" },
  { value: "enterprise", label: "Enterprise" },
];

const CHANNEL_OPTIONS = [
  { value: "web", label: "Web Notification (Dashboard)" },
  { value: "line", label: "LINE Group" },
];

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function statusBadge(s: string) {
  const map: Record<string, string> = {
    sent: "bg-green-100 text-green-800",
    partial: "bg-amber-100 text-amber-800",
    failed: "bg-red-100 text-red-800",
    draft: "bg-brand-100 text-brand-800",
  };
  return map[s] ?? "bg-brand-100 text-brand-800";
}

export default async function AdminNotificationsPage() {
  await requireModule("notifications");

  const admin = createAdminClient();
  const [{ data: anns }, line] = await Promise.all([
    admin
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50),
    getLineSettings(),
  ]);

  const list = (anns ?? []) as Announcement[];
  const lineReady = line.enabled && !!line.channel_access_token && !!line.group_id;

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-brand-800">Notification Center</h1>
        <p className="text-sm text-brand-900/60 mt-1">
          ส่งประกาศไปยัง Web Dashboard และ LINE Group ของสมาชิก
        </p>
      </div>

      {!lineReady && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ⚠️ LINE Group ยังไม่ถูกตั้งค่า —{" "}
          <a href="/admin/settings/line" className="underline font-medium">
            ไปตั้งค่า LINE
          </a>{" "}
          ก่อนใช้ช่องทางนี้
        </div>
      )}

      {/* Create form */}
      <form action={sendAnnouncement} className="card p-6 space-y-5">
        <div>
          <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">หัวข้อ</label>
          <input
            type="text"
            name="title"
            required
            maxLength={100}
            placeholder='เช่น "SMF IoT จะปิดปรับปรุงระบบ วันที่ 15 สิงหาคม"'
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">ข้อความ</label>
          <textarea
            name="message"
            required
            rows={5}
            maxLength={2000}
            placeholder="รายละเอียดที่ต้องการแจ้งให้สมาชิกทราบ..."
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition resize-y"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          <fieldset>
            <legend className="text-sm font-semibold text-brand-900/85 mb-2">ส่งให้ใคร (Targets)</legend>
            <div className="space-y-2">
              {PLAN_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-sm text-brand-900/80">
                  <input
                    type="checkbox"
                    name="targets"
                    value={opt.value}
                    defaultChecked={opt.value === "all"}
                    className="rounded border-border text-brand-600 focus:ring-brand-500/30"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-brand-900/50">
              ติ๊ก &quot;All Users&quot; = ส่งถึงทุกคน (ทับ plan อื่น)
            </p>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold text-brand-900/85 mb-2">ช่องทาง (Channels)</legend>
            <div className="space-y-2">
              {CHANNEL_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-sm text-brand-900/80">
                  <input
                    type="checkbox"
                    name="channels"
                    value={opt.value}
                    defaultChecked={opt.value === "web"}
                    className="rounded border-border text-brand-600 focus:ring-brand-500/30"
                  />
                  {opt.label}
                  {opt.value === "line" && !lineReady && (
                    <span className="text-[10px] text-amber-700 font-semibold">(ยังไม่ตั้งค่า)</span>
                  )}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            className="rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2.5 text-sm transition"
          >
            ส่งประกาศ
          </button>
        </div>
      </form>

      {/* History */}
      <div>
        <h2 className="text-lg font-bold text-brand-800 mb-3">ประวัติการส่ง</h2>
        {list.length === 0 ? (
          <div className="card p-6 text-center text-sm text-brand-900/55">ยังไม่มีประกาศ</div>
        ) : (
          <div className="space-y-3">
            {list.map((a) => (
              <div key={a.id} className="card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${statusBadge(a.status)}`}>
                        {a.status}
                      </span>
                      <span className="text-xs text-brand-900/50">{fmtDate(a.created_at)}</span>
                    </div>
                    <div className="mt-1.5 font-semibold text-brand-800">{a.title}</div>
                    <p className="mt-1 text-sm text-brand-900/70 whitespace-pre-wrap">{a.message}</p>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {a.target_plans.map((p) => (
                        <span key={p} className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-100">
                          {p}
                        </span>
                      ))}
                      {a.channels.map((c) => (
                        <span key={c} className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-white border border-border text-brand-800">
                          {c === "web" ? "🖥 web" : "💬 line"}
                        </span>
                      ))}
                    </div>

                    <div className="mt-2 text-xs text-brand-900/60">
                      Web recipients: <span className="font-semibold">{a.web_recipients_count ?? 0}</span>
                      {a.line_error && (
                        <span className="ml-3 text-red-700">LINE error: {a.line_error}</span>
                      )}
                    </div>
                  </div>

                  <form action={deleteAnnouncement.bind(null, a.id)}>
                    <button
                      type="submit"
                      className="text-xs text-red-700 hover:text-red-900 border border-red-200 hover:bg-red-50 rounded-full px-3 py-1.5 transition"
                    >
                      ลบ
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
