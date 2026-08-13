"use client";

import { useActionState } from "react";
import { updateProfile, type ActionResult } from "../actions";

export function ProfileForm({
  email,
  initialName,
  initialPhone,
  provider,
}: {
  email: string;
  initialName: string;
  initialPhone: string;
  provider: string;
}) {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(
    updateProfile,
    null
  );

  return (
    <form action={formAction} className="card p-6 space-y-5">
      <div>
        <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">
          ชื่อ - นามสกุล
        </label>
        <input
          type="text"
          name="full_name"
          defaultValue={initialName}
          required
          className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">
          เบอร์โทรศัพท์
        </label>
        <input
          type="tel"
          name="phone"
          defaultValue={initialPhone}
          placeholder="081-234-5678"
          className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">
          อีเมล <span className="text-xs font-normal text-brand-900/50">(แก้ไขไม่ได้)</span>
        </label>
        <input
          type="email"
          value={email}
          readOnly
          className="w-full rounded-xl border border-border bg-brand-50/60 text-brand-900/70 px-4 py-2.5 cursor-not-allowed"
        />
        <p className="mt-1 text-xs text-brand-900/55">
          เข้าสู่ระบบผ่าน <span className="font-semibold capitalize">{provider}</span>
        </p>
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
        {pending ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
      </button>
    </form>
  );
}
