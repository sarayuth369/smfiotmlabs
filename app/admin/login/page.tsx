"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { adminLogin, type LoginResult } from "./actions";

const initial: LoginResult | null = null;

export default function AdminLoginPage() {
  const router = useRouter();
  const [state, action, pending] = useActionState<LoginResult | null, FormData>(
    adminLogin as unknown as (
      prev: LoginResult | null,
      form: FormData
    ) => Promise<LoginResult>,
    initial
  );

  useEffect(() => {
    if (state?.ok) {
      router.replace("/admin/dashboard");
      router.refresh();
    }
  }, [state, router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-brand-800 via-brand-700 to-brand-900">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600 text-white text-2xl font-black shadow-lg shadow-brand-600/30">
              A
            </div>
            <h1 className="mt-4 text-2xl font-bold text-brand-800">SMF IoT Admin</h1>
            <p className="mt-1 text-sm text-brand-900/60">Control Center — เข้าสู่ระบบผู้ดูแล</p>
          </div>

          {state && !state.ok && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {state.error}
            </div>
          )}

          <form action={action} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-brand-900/85">ชื่อผู้ใช้</span>
              <input
                type="text"
                name="username"
                autoComplete="username"
                required
                autoFocus
                defaultValue="admin"
                className="mt-1.5 w-full rounded-xl border border-border bg-white px-4 py-3 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-brand-900/85">รหัสผ่าน</span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                className="mt-1.5 w-full rounded-xl border border-border bg-white px-4 py-3 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
              />
            </label>

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-70 text-white font-semibold py-3 shadow-lg shadow-brand-600/20 transition"
            >
              {pending ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-brand-900/50">
            ครั้งแรก: <span className="font-semibold">admin / 11223344</span> — ระบบจะสร้าง Super Admin อัตโนมัติ
          </p>
        </div>
      </div>
    </div>
  );
}
