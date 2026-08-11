"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminRole } from "@/lib/admin/session";

const ROLES: AdminRole[] = ["super_admin", "admin", "support", "sales", "technician", "content"];

export type MutateResult = { ok: true } | { ok: false; error: string };

export async function createAdminUser(formData: FormData): Promise<MutateResult> {
  await requireModule("admin_users");

  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "") as AdminRole;

  if (!username || !password) return { ok: false, error: "กรอกชื่อผู้ใช้และรหัสผ่านให้ครบ" };
  if (password.length < 8) return { ok: false, error: "รหัสผ่านต้องอย่างน้อย 8 ตัวอักษร" };
  if (!ROLES.includes(role)) return { ok: false, error: "Role ไม่ถูกต้อง" };

  const admin = createAdminClient();
  const hash = await bcrypt.hash(password, 10);

  const { error } = await admin.from("admin_users").insert({
    username,
    password_hash: hash,
    role,
    is_active: true,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "ชื่อผู้ใช้นี้ถูกใช้แล้ว" };
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/admin-users");
  return { ok: true };
}

export async function setActive(id: string, active: boolean) {
  await requireModule("admin_users");
  const admin = createAdminClient();
  await admin.from("admin_users").update({ is_active: active }).eq("id", id);
  revalidatePath("/admin/admin-users");
}

export async function updateRole(id: string, formData: FormData) {
  await requireModule("admin_users");
  const role = String(formData.get("role") ?? "") as AdminRole;
  if (!ROLES.includes(role)) return;
  const admin = createAdminClient();
  await admin.from("admin_users").update({ role }).eq("id", id);
  revalidatePath("/admin/admin-users");
}

export async function resetPassword(id: string, formData: FormData): Promise<MutateResult> {
  await requireModule("admin_users");
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { ok: false, error: "รหัสผ่านต้องอย่างน้อย 8 ตัวอักษร" };
  const admin = createAdminClient();
  const hash = await bcrypt.hash(password, 10);
  await admin.from("admin_users").update({ password_hash: hash }).eq("id", id);
  revalidatePath("/admin/admin-users");
  return { ok: true };
}

export async function deleteAdminUser(id: string) {
  await requireModule("admin_users");
  const admin = createAdminClient();
  await admin.from("admin_users").delete().eq("id", id);
  revalidatePath("/admin/admin-users");
}
