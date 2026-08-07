"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  TextField,
  PasswordField,
  GoogleIcon,
  OrDivider,
  AuthI,
} from "../_components/AuthUI";
import { LegalLinks } from "../_components/LegalLinks";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="h-8 animate-pulse bg-brand-100/50 rounded" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const initialError = params.get("error");

  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setLoading(false);
      setError(mapAuthError(error.message));
      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function onGoogle() {
    setError(null);
    setOauthLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
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
        <h1 className="text-3xl font-bold text-brand-800">เข้าสู่ระบบ</h1>
        <p className="mt-2 text-sm text-brand-900/65">
          ยังไม่มีบัญชี?{" "}
          <Link href="/signup" className="text-brand-600 font-semibold hover:text-brand-800">
            สมัครสมาชิก
          </Link>
        </p>
      </div>

      {error && <AlertError message={error} />}

      <button
        type="button"
        onClick={onGoogle}
        disabled={oauthLoading}
        className="w-full flex items-center justify-center gap-3 rounded-xl border border-border bg-white hover:bg-brand-50 disabled:opacity-70 transition py-3 font-medium text-brand-900"
      >
        <GoogleIcon />
        {oauthLoading ? "กำลังเปิด Google..." : "เข้าสู่ระบบด้วย Google"}
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
        <LegalLinks
          prefix="การเข้าสู่ระบบถือว่าคุณยอมรับ "
          linkClassName="underline hover:text-brand-700"
        />
      </p>
    </div>
  );
}

function AlertError({ message }: { message: string }) {
  return (
    <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {message}
    </div>
  );
}

function mapAuthError(msg: string) {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
  if (m.includes("email not confirmed")) return "กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ";
  return msg;
}
