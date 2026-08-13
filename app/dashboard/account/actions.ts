"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

export async function updateProfile(_: unknown, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "กรุณาเข้าสู่ระบบก่อน" };

  const full_name = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!full_name) return { ok: false, error: "กรุณากรอกชื่อ" };

  const { error: profErr } = await supabase
    .from("profiles")
    .update({ full_name, phone })
    .eq("id", user.id);
  if (profErr) return { ok: false, error: profErr.message };

  // Also sync user_metadata so header/other components show the new name
  const { error: authErr } = await supabase.auth.updateUser({
    data: { full_name, phone },
  });
  if (authErr) return { ok: false, error: authErr.message };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/account");
  return { ok: true, message: "บันทึกข้อมูลเรียบร้อย" };
}

export async function changePassword(_: unknown, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "กรุณาเข้าสู่ระบบก่อน" };

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) return { ok: false, error: "รหัสผ่านต้องอย่างน้อย 8 ตัวอักษร" };
  if (password !== confirm) return { ok: false, error: "รหัสผ่านยืนยันไม่ตรงกัน" };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: error.message };

  return { ok: true, message: "เปลี่ยนรหัสผ่านเรียบร้อย" };
}
