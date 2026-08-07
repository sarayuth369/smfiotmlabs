"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  TextField,
  PasswordField,
  GoogleIcon,
  OrDivider,
  AuthI,
} from "../_components/AuthUI";
import { LegalLinks } from "../_components/LegalLinks";

export default function SignupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const strength = getStrength(password);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") || "").trim();
    const phone = String(form.get("phone") || "").trim();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const pw = String(form.get("password") || "");

    const supabase = createClient();

    const { data, error } = await supabase.auth.signUp({
      email,
      password: pw,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { full_name: name, phone },
      },
    });

    if (error) {
      setLoading(false);
      setError(mapSignupError(error.message));
      return;
    }

    // Supabase returns identities=[] when the email is already registered
    // (with "Confirm email" enabled) — signal duplicate to the user.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setLoading(false);
      setError("อีเมลนี้ถูกใช้งานแล้ว กรุณาเข้าสู่ระบบหรือใช้อีเมลอื่น");
      return;
    }

    // Best-effort profile row for password signups.
    // With the recommended DB trigger (see SUPABASE_SETUP.md) this is redundant but safe.
    if (data.user) {
      await supabase.from("profiles").upsert(
        {
          id: data.user.id,
          email,
          full_name: name,
          phone,
          provider: "email",
        },
        { onConflict: "id" }
      );
    }

    // Session is null when email confirmation is required
    if (!data.session) {
      setLoading(false);
      setInfo("สมัครสำเร็จ กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชี");
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  async function onGoogle() {
    setError(null);
    setOauthLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });
    if (error) {
      setOauthLoading(false);
      setError(error.message);
    }
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

      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {info && (
        <div className="mb-5 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
          {info}
        </div>
      )}

      <button
        type="button"
        onClick={onGoogle}
        disabled={oauthLoading}
        className="w-full flex items-center justify-center gap-3 rounded-xl border border-border bg-white hover:bg-brand-50 disabled:opacity-70 transition py-3 font-medium text-brand-900"
      >
        <GoogleIcon /> {oauthLoading ? "กำลังเปิด Google..." : "สมัครด้วย Google"}
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

        <div className="flex items-start gap-2 text-sm text-brand-900/75">
          <input
            id="accept-terms"
            type="checkbox"
            required
            className="mt-1 rounded border-border text-brand-600 focus:ring-brand-500/30"
          />
          <label htmlFor="accept-terms" className="flex-1">
            <LegalLinks prefix="ยอมรับ " />
          </label>
        </div>

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

function mapSignupError(msg: string) {
  const m = msg.toLowerCase();
  if (m.includes("user already registered") || m.includes("already been registered"))
    return "อีเมลนี้ถูกใช้งานแล้ว กรุณาเข้าสู่ระบบหรือใช้อีเมลอื่น";
  if (m.includes("password should be at least"))
    return "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร";
  if (m.includes("invalid email")) return "รูปแบบอีเมลไม่ถูกต้อง";
  return msg;
}
