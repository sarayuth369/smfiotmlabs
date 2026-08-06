"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  TextField,
  PasswordField,
  GoogleIcon,
  OrDivider,
  AuthI,
} from "../_components/AuthUI";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => setLoading(false), 900);
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-brand-800">เข้าสู่ระบบ</h1>
        <p className="mt-2 text-sm text-brand-900/65">
          ยังไม่มีบัญชี?{" "}
          <Link href="/signup" className="text-brand-600 font-semibold hover:text-brand-800">
            สมัครสมาชิก
          </Link>
        </p>
      </div>

      <button
        type="button"
        className="w-full flex items-center justify-center gap-3 rounded-xl border border-border bg-white hover:bg-brand-50 transition py-3 font-medium text-brand-900"
      >
        <GoogleIcon /> เข้าสู่ระบบด้วย Google
      </button>

      <OrDivider />

      <form onSubmit={onSubmit} className="space-y-4">
        <TextField
          label="อีเมล"
          name="email"
          type="email"
          placeholder="you@example.com"
          icon={<AuthI.Mail />}
          autoComplete="email"
          required
        />

        <div>
          <PasswordField
            label="รหัสผ่าน"
            name="password"
            placeholder="••••••••"
            icon={<AuthI.Lock />}
            autoComplete="current-password"
            required
          />
          <div className="mt-2 flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-brand-900/70">
              <input type="checkbox" className="rounded border-border text-brand-600 focus:ring-brand-500/30" />
              จดจำการเข้าสู่ระบบ
            </label>
            <Link href="/forgot-password" className="text-brand-600 hover:text-brand-800 font-medium">
              ลืมรหัสผ่าน?
            </Link>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-70 text-white font-semibold py-3 shadow-lg shadow-brand-600/20 transition"
        >
          {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </button>
      </form>

      <p className="mt-8 text-center text-xs text-brand-900/50">
        การเข้าสู่ระบบถือว่าคุณยอมรับ{" "}
        <a className="underline hover:text-brand-700" href="#">ข้อกำหนดการใช้งาน</a>{" "}
        และ{" "}
        <a className="underline hover:text-brand-700" href="#">นโยบายความเป็นส่วนตัว</a>
      </p>
    </div>
  );
}
