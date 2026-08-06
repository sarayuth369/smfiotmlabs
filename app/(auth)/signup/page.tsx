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

export default function SignupPage() {
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");

  const strength = getStrength(password);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => setLoading(false), 900);
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-brand-800">สมัครสมาชิก</h1>
        <p className="mt-2 text-sm text-brand-900/65">
          มีบัญชีอยู่แล้ว?{" "}
          <Link href="/login" className="text-brand-600 font-semibold hover:text-brand-800">
            เข้าสู่ระบบ
          </Link>
        </p>
      </div>

      <button
        type="button"
        className="w-full flex items-center justify-center gap-3 rounded-xl border border-border bg-white hover:bg-brand-50 transition py-3 font-medium text-brand-900"
      >
        <GoogleIcon /> สมัครด้วย Google
      </button>

      <OrDivider />

      <form onSubmit={onSubmit} className="space-y-4">
        <TextField
          label="ชื่อ - นามสกุล"
          name="name"
          placeholder="สมชาย ใจดี"
          icon={<AuthI.User />}
          autoComplete="name"
          required
        />

        <TextField
          label="เบอร์โทรศัพท์"
          name="phone"
          type="tel"
          placeholder="081-234-5678"
          icon={<AuthI.Phone />}
          inputMode="tel"
          pattern="[0-9\-\s]{9,}"
          autoComplete="tel"
          required
        />

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
            placeholder="อย่างน้อย 8 ตัวอักษร"
            icon={<AuthI.Lock />}
            minLength={8}
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {password && (
            <div className="mt-2">
              <div className="h-1.5 rounded-full bg-border overflow-hidden flex gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={`flex-1 h-full rounded-full transition ${
                      i < strength.score ? strength.color : "bg-transparent"
                    }`}
                  />
                ))}
              </div>
              <div className="mt-1 text-xs text-brand-900/60">
                ความปลอดภัย: <span className="font-medium">{strength.label}</span>
              </div>
            </div>
          )}
        </div>

        <label className="flex items-start gap-2 text-sm text-brand-900/75">
          <input type="checkbox" required className="mt-1 rounded border-border text-brand-600 focus:ring-brand-500/30" />
          <span>
            ยอมรับ{" "}
            <a href="#" className="text-brand-600 hover:text-brand-800 underline">ข้อกำหนดการใช้งาน</a>{" "}
            และ{" "}
            <a href="#" className="text-brand-600 hover:text-brand-800 underline">นโยบายความเป็นส่วนตัว</a>
          </span>
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-70 text-white font-semibold py-3 shadow-lg shadow-brand-600/20 transition"
        >
          {loading ? "กำลังสมัคร..." : "สมัครสมาชิก"}
        </button>
      </form>
    </div>
  );
}

function getStrength(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const levels = [
    { label: "อ่อนมาก", color: "bg-red-400" },
    { label: "อ่อน", color: "bg-orange-400" },
    { label: "ปานกลาง", color: "bg-yellow-400" },
    { label: "ดี", color: "bg-brand-400" },
    { label: "แข็งแรง", color: "bg-brand-600" },
  ];
  return { score, ...levels[score] };
}
