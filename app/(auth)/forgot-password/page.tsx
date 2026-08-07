"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { TextField, AuthI } from "../_components/AuthUI";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-brand-800">ลืมรหัสผ่าน?</h1>
        <p className="mt-2 text-sm text-brand-900/65">
          กรอกอีเมลที่ใช้สมัคร ระบบจะส่งลิงก์รีเซ็ตรหัสผ่านให้คุณ
        </p>
      </div>

      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {sent ? (
        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-6 text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-brand-600 text-white flex items-center justify-center text-2xl">
            ✓
          </div>
          <h2 className="mt-4 text-lg font-bold text-brand-800">ส่งลิงก์เรียบร้อยแล้ว</h2>
          <p className="mt-2 text-sm text-brand-900/70">
            เราส่งลิงก์รีเซ็ตรหัสผ่านไปที่ <span className="font-semibold">{email}</span> แล้ว
            <br />กรุณาตรวจสอบกล่องจดหมาย (รวมถึง Junk / Spam)
          </p>
          <button
            type="button"
            onClick={() => setSent(false)}
            className="mt-5 text-sm font-medium text-brand-700 hover:text-brand-900"
          >
            ไม่ได้รับอีเมล? ส่งอีกครั้ง
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          <TextField
            label="อีเมล"
            name="email"
            type="email"
            placeholder="you@example.com"
            icon={<AuthI.Mail />}
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-70 text-white font-semibold py-3 shadow-lg shadow-brand-600/20 transition"
          >
            {loading ? "กำลังส่ง..." : "ส่งลิงก์รีเซ็ตรหัสผ่าน"}
          </button>
        </form>
      )}

      <div className="mt-6 text-center text-sm">
        <Link href="/login" className="text-brand-700 hover:text-brand-900 font-medium">
          ← กลับไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    </div>
  );
}
