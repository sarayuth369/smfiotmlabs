"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminRole } from "@/lib/admin/session";

const ROLES: AdminRole[] = ["super_admin", "admin", "support", "sales", "technician", "content"];

export async function createAdminUser(formData: FormData): Promise<void> {
  await requireModule("admin_users");

  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "") as AdminRole;

  if (!username || !password || password.length < 8 || !ROLES.includes(role)) {
    console.warn("[admin-users.create] validation failed", { username, role });
    return;
  }

  const admin = createAdminClient();
  const hash = await bcrypt.hash(password, 10);

  const { error } = await admin.from("admin_users").insert({
    username,
    password_hash: hash,
    role,
    is_active: true,
  });
  if (error) console.warn("[admin-users.create] db error", error);

  revalidatePath("/admin/admin-users");
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

export async function resetPassword(id: string, formData: FormData): Promise<void> {
  await requireModule("admin_users");
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return;
  const admin = createAdminClient();
  const hash = await bcrypt.hash(password, 10);
  await admin.from("admin_users").update({ password_hash: hash }).eq("id", id);
  revalidatePath("/admin/admin-users");
}

export async function deleteAdminUser(id: string) {
  await requireModule("admin_users");
  const admin = createAdminClient();
  await admin.from("admin_users").delete().eq("id", id);
  revalidatePath("/admin/admin-users");
}
