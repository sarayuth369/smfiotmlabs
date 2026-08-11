import { requireModule } from "@/lib/admin/current";
import { getLineSettings } from "@/lib/admin/settings";
import { updateLineSettings, sendLineTest } from "./actions";

export default async function LineSettingsPage() {
  await requireModule("settings");
  const line = await getLineSettings();
  const ready = line.enabled && !!line.channel_access_token && !!line.group_id;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="text-xs text-brand-700/70 font-medium">System Settings</div>
        <h1 className="text-2xl font-bold text-brand-800">LINE Integration</h1>
        <p className="text-sm text-brand-900/60 mt-1">
          ตั้งค่า LINE Messaging API เพื่อส่งประกาศไปยัง LINE Group @smfiotmlabs
        </p>
      </div>

      <div
        className={`rounded-xl border px-4 py-3 text-sm ${
          ready
            ? "border-green-200 bg-green-50 text-green-800"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        สถานะ: <span className="font-semibold">{ready ? "พร้อมใช้งาน" : "ยังไม่พร้อม"}</span>
      </div>

      <form action={updateLineSettings} className="card p-6 space-y-5">
        <div>
          <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">
            Channel Access Token
          </label>
          <input
            type="password"
            name="channel_access_token"
            defaultValue={line.channel_access_token}
            placeholder="Long-lived access token จาก LINE Developers Console"
            autoComplete="off"
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition font-mono text-sm"
          />
          <p className="mt-1 text-xs text-brand-900/50">
            LINE Developers Console → Messaging API channel → tab &quot;Messaging API&quot; → Channel access token
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">
            Group ID (ปลายทาง)
          </label>
          <input
            type="text"
            name="group_id"
            defaultValue={line.group_id}
            placeholder="Cxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            autoComplete="off"
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition font-mono text-sm"
          />
          <p className="mt-1 text-xs text-brand-900/50">
            Group ID ที่ต้องการส่ง (ขึ้นต้นด้วย C) — หาได้จาก webhook event หรือ LINE Bot Designer
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm text-brand-900/80">
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={line.enabled}
            className="rounded border-border text-brand-600 focus:ring-brand-500/30"
          />
          เปิดใช้งาน LINE Channel
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className="rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2.5 text-sm transition"
          >
            บันทึก
          </button>
        </div>
      </form>

      <form action={sendLineTest} className="card p-6">
        <div className="text-sm font-semibold text-brand-800">ทดสอบการเชื่อมต่อ</div>
        <p className="text-xs text-brand-900/60 mt-1">
          ส่งข้อความทดสอบไปยัง Group ID ที่ตั้งค่าไว้
        </p>
        <button
          type="submit"
          disabled={!ready}
          className="mt-3 rounded-full border border-border hover:border-brand-400 disabled:opacity-50 disabled:cursor-not-allowed text-brand-800 font-medium px-5 py-2 text-sm transition"
        >
          ส่งข้อความทดสอบ
        </button>
      </form>
    </div>
  );
}
