import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatThaiDateTime } from "@/lib/payment";
import { updateAppVersionPolicy } from "./actions";

type AppVersionPolicyRow = {
  platform: string;
  latest_version: string;
  minimum_version: string;
  force_update: boolean;
  release_notes: string | null;
  play_store_url: string | null;
  is_active: boolean;
  updated_at: string;
};

export default async function AppVersionPage() {
  await requireModule("settings");

  const admin = createAdminClient();
  const { data } = await admin
    .from("app_version_policies")
    .select("platform, latest_version, minimum_version, force_update, release_notes, play_store_url, is_active, updated_at")
    .eq("platform", "android")
    .maybeSingle();
  const policy = data as AppVersionPolicyRow | null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="text-xs text-brand-700/70 font-medium">System Settings</div>
        <h1 className="text-2xl font-bold text-brand-800">App Version Management</h1>
        <p className="text-sm text-brand-900/60 mt-1">
          ควบคุมเวอร์ชันแอป Android ที่ผู้ใช้ต้องมี — Flutter อ่านค่านี้ตรง มีผลทันทีโดยไม่ต้อง build แอปใหม่
        </p>
      </div>

      <div
        className={`rounded-xl border px-4 py-3 text-sm ${
          policy?.is_active
            ? "border-green-200 bg-green-50 text-green-800"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        สถานะ:{" "}
        <span className="font-semibold">
          {policy ? (policy.is_active ? "เปิดใช้งาน" : "ปิดใช้งาน") : "ยังไม่ตั้งค่า"}
        </span>
        {policy && <> — อัปเดตล่าสุด {formatThaiDateTime(policy.updated_at)} น.</>}
      </div>

      <form action={updateAppVersionPolicy} className="card p-6 space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">
              Latest Version
            </label>
            <input
              type="text"
              name="latest_version"
              defaultValue={policy?.latest_version ?? ""}
              placeholder="2.1.0"
              pattern="\d+\.\d+\.\d+"
              required
              autoComplete="off"
              className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition font-mono text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">
              Minimum Supported Version
            </label>
            <input
              type="text"
              name="minimum_version"
              defaultValue={policy?.minimum_version ?? ""}
              placeholder="2.0.0"
              pattern="\d+\.\d+\.\d+"
              required
              autoComplete="off"
              className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition font-mono text-sm"
            />
          </div>
        </div>
        <p className="text-xs text-brand-900/50 -mt-3">
          รูปแบบ x.y.z เท่านั้น (semver) — Latest Version ต้อง &ge; Minimum Version เสมอ ระบบตรวจทั้งฝั่ง server และฐานข้อมูล
        </p>

        <div>
          <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">
            Release Notes
          </label>
          <textarea
            name="release_notes"
            defaultValue={policy?.release_notes ?? ""}
            rows={4}
            placeholder="สิ่งที่แก้ไข/เพิ่มในเวอร์ชันนี้"
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">
            Google Play URL
          </label>
          <input
            type="url"
            name="play_store_url"
            defaultValue={policy?.play_store_url ?? ""}
            placeholder="https://play.google.com/store/apps/details?id=..."
            autoComplete="off"
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition font-mono text-sm"
          />
          <p className="mt-1 text-xs text-brand-900/50">
            ต้องเป็นลิงก์ play.google.com — ใช้เมื่อ In-App Update ในแอปใช้งานไม่ได้ (เช่น debug/sideload)
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm text-brand-900/80">
          <input
            type="checkbox"
            name="force_update"
            defaultChecked={policy?.force_update ?? false}
            className="rounded border-border text-brand-600 focus:ring-brand-500/30"
          />
          บังคับอัปเดต (Force Update) — ผู้ใช้เวอร์ชันต่ำกว่า Minimum ใช้งานต่อไม่ได้จนกว่าจะอัปเดต
        </label>

        <label className="flex items-center gap-2 text-sm text-brand-900/80">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={policy?.is_active ?? true}
            className="rounded border-border text-brand-600 focus:ring-brand-500/30"
          />
          เปิดใช้งานนโยบายนี้ (ปิด = แอปไม่เห็นแจ้งเตือนอัปเดตเลย)
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
    </div>
  );
}
