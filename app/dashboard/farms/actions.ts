"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canCreateFarm } from "@/lib/plan-limits";

const AREA_UNITS = ["ไร่", "งาน", "ตร.ว.", "ตร.ม."] as const;
type AreaUnit = (typeof AREA_UNITS)[number];

const FARM_TYPES = ["ผัก", "ผลไม้", "ข้าว", "โรงเรือน", "Hydroponic", "Smart Farm"] as const;

function parseFarmFields(fd: FormData) {
  const name = String(fd.get("name") ?? "").trim();
  const description = String(fd.get("description") ?? "").trim() || null;
  const province = String(fd.get("province") ?? "").trim() || null;
  const district = String(fd.get("district") ?? "").trim() || null;
  const subdistrict = String(fd.get("subdistrict") ?? "").trim() || null;

  const areaRaw = String(fd.get("area") ?? "").trim();
  const area = areaRaw === "" ? null : Number(areaRaw);
  if (area !== null && (isNaN(area) || area < 0)) throw new Error("พื้นที่ต้องเป็นตัวเลข");

  const areaUnitRaw = String(fd.get("area_unit") ?? "ไร่");
  const area_unit: AreaUnit = (AREA_UNITS as readonly string[]).includes(areaUnitRaw)
    ? (areaUnitRaw as AreaUnit)
    : "ไร่";

  const farmTypeRaw = String(fd.get("farm_type") ?? "").trim();
  const farm_type = (FARM_TYPES as readonly string[]).includes(farmTypeRaw) ? farmTypeRaw : null;

  const latRaw = String(fd.get("latitude") ?? "").trim();
  const lngRaw = String(fd.get("longitude") ?? "").trim();
  const latitude = latRaw === "" ? null : Number(latRaw);
  const longitude = lngRaw === "" ? null : Number(lngRaw);
  if (latitude !== null && isNaN(latitude)) throw new Error("Latitude ต้องเป็นตัวเลข");
  if (longitude !== null && isNaN(longitude)) throw new Error("Longitude ต้องเป็นตัวเลข");

  if (!name) throw new Error("กรุณากรอกชื่อฟาร์ม");

  return {
    name,
    description,
    province,
    district,
    subdistrict,
    area,
    area_unit,
    farm_type,
    latitude,
    longitude,
  };
}

export async function createFarm(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/farms/new");

  // Server-side plan limit gate (must not trust client)
  const check = await canCreateFarm(supabase, user.id);
  if (!check.ok) throw new Error(check.reason ?? "เกินโควตาแพ็กเกจ");

  const fields = parseFarmFields(formData);
  const { data, error } = await supabase
    .from("farms")
    .insert({ ...fields, user_id: user.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/farms");
  redirect(`/dashboard/farms/${data.id}`);
}

export async function updateFarm(farmId: string, formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const fields = parseFarmFields(formData);
  // RLS enforces ownership; explicit eq(user_id) is belt+suspenders
  const { error } = await supabase
    .from("farms")
    .update(fields)
    .eq("id", farmId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/farms");
  revalidatePath(`/dashboard/farms/${farmId}`);
  redirect(`/dashboard/farms/${farmId}`);
}

export async function archiveFarm(farmId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("farms")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", farmId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/farms");
  revalidatePath(`/dashboard/farms/${farmId}`);
  redirect("/dashboard/farms");
}

export async function restoreFarm(farmId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Re-check plan limit — restoring counts against active quota again
  const check = await canCreateFarm(supabase, user.id);
  if (!check.ok) throw new Error(check.reason ?? "เกินโควตาแพ็กเกจ ไม่สามารถกู้คืนได้");

  const { error } = await supabase
    .from("farms")
    .update({ archived_at: null })
    .eq("id", farmId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/farms");
  revalidatePath(`/dashboard/farms/${farmId}`);
  redirect(`/dashboard/farms/${farmId}`);
}

export async function deleteFarm(farmId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("farms")
    .delete()
    .eq("id", farmId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/farms");
  redirect("/dashboard/farms");
}
