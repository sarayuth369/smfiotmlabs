import Link from "next/link";
import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupportAiConfig, getSupportLineSettings, isSupportLineReady, hasSupportProviderKey } from "@/lib/support/settings";
import { updateSupportAiConfig, updateSupportLineSettings } from "./actions";

export default async function AdminSupportPage() {
  await requireModule("support_chat");
  const admin = createAdminClient();

  const [cfg, line] = await Promise.all([getSupportAiConfig(), getSupportLineSettings()]);
  const lineReady = isSupportLineReady(line);
  const configured = hasSupportProviderKey(cfg.provider);

  const [{ count: totalConversations }, { count: activeConversations }, { count: escalatedConversations }, { data: recentEscalations }] = await Promise.all([
    admin.from("support_conversations").select("id", { count: "exact", head: true }),
    admin.from("support_conversations").select("id", { count: "exact", head: true }).eq("status", "AI_ACTIVE"),
    admin.from("support_conversations").select("id", { count: "exact", head: true }).eq("status", "ESCALATED"),
    admin
      .from("support_conversations")
      .select("id, user_id, escalation_reason, escalated_at")
      .eq("status", "ESCALATED")
      .order("escalated_at", { ascending: false })
      .limit(10),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-800">Customer Support</h1>
          <p className="text-sm text-brand-900/60 mt-1">
            AI Support Chat — API key อยู่ใน environment variables เท่านั้น หน้านี้เก็บแค่การตั้งค่าที่ไม่ใช่ secret
          </p>
        </div>
        <Link href="/admin/support/knowledge" className="rounded-full border border-brand-200 hover:border-brand-400 text-brand-800 text-sm font-semibold px-4 py-2 transition shrink-0">
          📚 Knowledge Base
        </Link>
      </div>

      <div className="card p-6">
        <h2 className="font-bold text-brand-800 mb-3">Monitoring</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-extrabold text-brand-800">{totalConversations ?? 0}</div>
            <div className="text-xs text-brand-900/55">Conversations ทั้งหมด</div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-brand-800">{activeConversations ?? 0}</div>
            <div className="text-xs text-brand-900/55">AI กำลังช่วยอยู่</div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-amber-700">{escalatedConversations ?? 0}</div>
            <div className="text-xs text-brand-900/55">ส่งต่อเจ้าหน้าที่</div>
          </div>
        </div>
      </div>

      {recentEscalations && recentEscalations.length > 0 && (
        <div className="card p-6">
          <h2 className="font-bold text-brand-800 mb-3">Recent Escalations</h2>
          <div className="space-y-2">
            {recentEscalations.map((e) => (
              <div key={e.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                <div className="font-semibold text-amber-900">{e.escalation_reason || "ไม่ระบุเหตุผล"}</div>
                <div className="text-xs text-amber-800/70 mt-0.5">{e.escalated_at ? new Date(e.escalated_at as string).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : ""}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <form action={updateSupportAiConfig} className="card p-6 space-y-5">
        <h2 className="font-bold text-brand-800">AI Settings</h2>

        <label className="flex items-center gap-2 text-sm text-brand-900/85">
          <input type="checkbox" name="enabled" defaultChecked={cfg.enabled} className="rounded border-border text-brand-600" />
          เปิดใช้งาน Support Chat
        </label>

        <div>
          <label className="text-xs font-semibold text-brand-900/70">Active Provider</label>
          <select name="provider" defaultValue={cfg.provider} className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm">
            <option value="groq">Groq (แนะนำ — เร็ว ประหยัด)</option>
            <option value="openai">OpenAI</option>
          </select>
          <p className="mt-1 text-xs text-brand-900/50">
            สถานะ API key: {configured ? <span className="text-green-700 font-semibold">Configured ✓</span> : <span className="text-red-600">ไม่พบ — ตั้งค่าใน environment variable</span>}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-brand-900/70">Groq Model</label>
            <input name="groq_model" defaultValue={cfg.groq_model} className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label className="text-xs font-semibold text-brand-900/70">OpenAI Model</label>
            <input name="openai_model" defaultValue={cfg.openai_model} className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono" />
          </div>
        </div>

        <h2 className="font-bold text-brand-800 pt-2 border-t border-border">Chat Settings</h2>

        <div>
          <label className="text-xs font-semibold text-brand-900/70">AI Assistant Name</label>
          <input name="assistant_name" defaultValue={cfg.assistant_name} className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="text-xs font-semibold text-brand-900/70">Welcome Message</label>
          <input name="welcome_message" defaultValue={cfg.welcome_message} className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
        </div>

        <div>
          <label className="text-xs font-semibold text-brand-900/70">Tone / Style</label>
          <input name="tone" defaultValue={cfg.tone} className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-brand-900/70">Max Response Length (chars)</label>
            <input type="number" name="max_response_length" defaultValue={cfg.max_response_length} min={100} className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-brand-900/70">แนะนำ Escalate หลังคุยกี่รอบ</label>
            <input type="number" name="escalation_after_turns" defaultValue={cfg.escalation_after_turns} min={1} className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="flex justify-end border-t border-border pt-4">
          <button type="submit" className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2 text-sm transition">
            บันทึก AI Settings
          </button>
        </div>
      </form>

      <form action={updateSupportLineSettings} className="card p-6 space-y-5">
        <div>
          <h2 className="font-bold text-brand-800">Human Handoff → LINE</h2>
          <p className="text-xs text-brand-900/50 mt-1">
            เมื่อ AI ส่งต่อเรื่องให้เจ้าหน้าที่ จะส่งสรุปบทสนทนาไปที่ LINE นี้ (แยกจาก LINE ประกาศลูกค้าใน System Settings)
          </p>
        </div>

        <div
          className={`rounded-xl border px-4 py-3 text-sm ${lineReady ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}
        >
          สถานะ: <span className="font-semibold">{lineReady ? "พร้อมใช้งาน" : "ยังไม่พร้อม"}</span>
        </div>

        <div>
          <label className="text-xs font-semibold text-brand-900/70">Channel Access Token</label>
          <input
            type="password"
            name="channel_access_token"
            defaultValue={line.channel_access_token}
            autoComplete="off"
            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono"
            placeholder="Long-lived access token — ใช้ channel เดียวกับ OA เจ้าหน้าที่ก็ได้"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-brand-900/70">โหมดการส่ง</label>
            <select name="mode" defaultValue={line.mode} className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm">
              <option value="user">User — ส่งหาเจ้าหน้าที่คนเดียว</option>
              <option value="group">Group — ส่งเข้ากลุ่มทีม Support</option>
              <option value="broadcast">Broadcast — ส่งทุกคนใน OA นี้</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-brand-900/70">Target ID</label>
            <input name="target_id" defaultValue={line.target_id} autoComplete="off" className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono" placeholder="ขึ้นต้นด้วย U หรือ C" />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-brand-900/80">
          <input type="checkbox" name="line_enabled" defaultChecked={line.enabled} className="rounded border-border text-brand-600" />
          เปิดใช้งาน LINE Handoff
        </label>

        <div className="flex justify-end border-t border-border pt-4">
          <button type="submit" className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2 text-sm transition">
            บันทึก LINE Handoff
          </button>
        </div>
      </form>
    </div>
  );
}
