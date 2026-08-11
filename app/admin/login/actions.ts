"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { COOKIE_NAME, MAX_AGE_SEC, signSession } from "@/lib/admin/session";

export type LoginResult = { ok: false; error: string } | { ok: true };

const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "11223344";

export async function adminLogin(_: unknown, formData: FormData): Promise<LoginResult> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { ok: false, error: "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน" };
  }

  const admin = createAdminClient();

  const { count } = await admin
    .from("admin_users")
    .select("id", { count: "exact", head: true });

  // Bootstrap: no admin exists yet — allow default credentials to create the first super_admin
  if ((count ?? 0) === 0) {
    if (username !== DEFAULT_USERNAME || password !== DEFAULT_PASSWORD) {
      return {
        ok: false,
        error: `ยังไม่มีผู้ดูแลระบบ ล็อกอินครั้งแรกด้วย ${DEFAULT_USERNAME}/${DEFAULT_PASSWORD} เพื่อสร้างบัญชี`,
      };
    }
    const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    const { error: insertErr } = await admin.from("admin_users").insert({
      username: DEFAULT_USERNAME,
      password_hash: hash,
      role: "super_admin",
      is_active: true,
    });
    if (insertErr) return { ok: false, error: insertErr.message };
  }

  const { data: user, error: fetchErr } = await admin
    .from("admin_users")
    .select("id, username, password_hash, role, is_active")
    .eq("username", username)
    .maybeSingle();

  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!user || !user.is_active) return { ok: false, error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" };

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return { ok: false, error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" };

  const token = signSession({ id: user.id, username: user.username, role: user.role });
  const c = await cookies();
  c.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });

  await admin
    .from("admin_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", user.id);

  return { ok: true };
}

export async function adminLogout() {
  const c = await cookies();
  c.delete(COOKIE_NAME);
  redirect("/admin/login");
}
