"use client";

import { useActionState } from "react";
import { changePassword, type ActionResult } from "../actions";

export function PasswordForm({ provider }: { provider: string }) {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(
    changePassword,
    null
  );

  const isOAuth = provider !== "email";

  return (
    <form action={formAction} className="card p-6 space-y-5">
      <div className="text-sm font-semibold text-brand-800">เปลี่ยนรหัสผ่าน</div>

      {isOAuth && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          บัญชีของคุณเข้าสู่ระบบผ่าน{" "}
          <span className="font-semibold capitalize">{provider}</span> —
          สามารถตั้งรหัสผ่านเพื่อเข้าสู่ระบบด้วยอีเมลเพิ่มเติมได้
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">
          รหัสผ่านใหม่
        </label>
        <input
          type="password"
          name="password"
          minLength={8}
          required
          autoComplete="new-password"
          placeholder="อย่างน้อย 8 ตัวอักษร"
          className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">
          ยืนยันรหัสผ่านใหม่
        </label>
        <input
          type="password"
          name="confirm"
          minLength={8}
          required
          autoComplete="new-password"
          className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
        />
      </div>

      {result && !result.ok && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {result.error}
        </div>
      )}
      {result && result.ok && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
          {result.message}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-brand-600 hover:bg-brand-700 disabled:opacity-70 text-white font-semibold px-6 py-2.5 text-sm transition"
      >
        {pending ? "กำลังเปลี่ยน..." : "เปลี่ยนรหัสผ่าน"}
      </button>
    </form>
  );
}
