import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAiConfig, getProviderStatuses } from "@/lib/admin/ai-settings";
import { updateAiConfig } from "./actions";

export default async function AdminAiPage() {
  await requireModule("ai");
  const admin = createAdminClient();

  const config = await getAiConfig();
  const providers = await getProviderStatuses(config);

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [{ count: requestsToday }, { count: requestsMonth }, { count: errorsMonth }] = await Promise.all([
    admin.from("ai_requests").select("id", { count: "exact", head: true }).gte("created_at", todayStart.toISOString()),
    admin.from("ai_requests").select("id", { count: "exact", head: true }).gte("created_at", monthStart.toISOString()),
    admin
      .from("ai_requests")
      .select("id", { count: "exact", head: true })
      .eq("ok", false)
      .gte("created_at", monthStart.toISOString()),
  ]);

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-800">AI Analysis</h1>
        <p className="text-sm text-brand-900/60 mt-1">
          ตั้งค่า AI Provider — API key อยู่ใน environment variables เท่านั้น หน้านี้เก็บแค่การตั้งค่าที่ไม่ใช่ secret
        </p>
      </div>

      <div className="card p-6 mb-6">
        <h2 className="font-bold text-brand-800 mb-3">Monitoring</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-extrabold text-brand-800">{requestsToday ?? 0}</div>
            <div className="text-xs text-brand-900/55">Requests today</div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-brand-800">{requestsMonth ?? 0}</div>
            <div className="text-xs text-brand-900/55">Usage this month</div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-red-700">{errorsMonth ?? 0}</div>
            <div className="text-xs text-brand-900/55">Errors this month</div>
          </div>
        </div>
      </div>

      <form action={updateAiConfig} className="card p-6 space-y-5">
        <div>
          <label className="text-xs font-semibold text-brand-900/70">Default Provider</label>
          <select
            name="default_provider"
            defaultValue={config.default_provider}
            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
          >
            <option value="gemini">Gemini</option>
            <option value="openai">OpenAI</option>
            <option value="groq">Groq</option>
          </select>
          <p className="mt-1 text-xs text-brand-900/50">
            ระบบใช้ provider นี้เท่านั้น — ไม่ fallback อัตโนมัติไป provider อื่น เพื่อป้องกันค่าใช้จ่ายพุ่งโดยไม่ตั้งใจ
          </p>
        </div>

        {providers.map((p) => (
          <div key={p.id} className="rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-bold text-brand-800 capitalize">{p.id}</div>
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={`font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    p.active
                      ? "bg-green-100 text-green-800"
                      : p.configured
                        ? "bg-amber-100 text-amber-800"
                        : "bg-brand-100 text-brand-700/60"
                  }`}
                >
                  {p.active ? "Active" : p.configured ? "Configured" : "Unavailable"}
                </span>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-brand-900/85">
              <input
                type="checkbox"
                name={`${p.id}_enabled`}
                defaultChecked={p.enabled}
                className="rounded border-border text-brand-600"
              />
              เปิดใช้งาน {p.id}
            </label>
            <div>
              <label className="text-xs font-semibold text-brand-900/70">Model</label>
              <input
                name={`${p.id}_model`}
                defaultValue={p.model}
                className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono"
              />
            </div>
            <div className="text-xs text-brand-900/50">
              API Key: {p.configured ? <span className="text-green-700 font-semibold">Configured ✓</span> : <span className="text-red-600">ไม่พบ — ตั้งค่าใน environment variable</span>}
            </div>
          </div>
        ))}

        <div className="flex justify-end border-t border-border pt-4">
          <button type="submit" className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2 text-sm transition">
            บันทึก
          </button>
        </div>
      </form>
    </div>
  );
}
