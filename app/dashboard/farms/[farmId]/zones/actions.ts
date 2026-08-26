"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canCreateZone } from "@/lib/plan-limits";

const AREA_UNITS = ["ไร่", "งาน", "ตร.ว.", "ตร.ม."] as const;
type AreaUnit = (typeof AREA_UNITS)[number];

function parseZoneFields(fd: FormData) {
  const name = String(fd.get("name") ?? "").trim();
  const description = String(fd.get("description") ?? "").trim() || null;
  const crop_type = String(fd.get("crop_type") ?? "").trim() || null;

  const areaRaw = String(fd.get("area") ?? "").trim();
  const area = areaRaw === "" ? null : Number(areaRaw);
  if (area !== null && (isNaN(area) || area < 0)) throw new Error("พื้นที่ต้องเป็นตัวเลข");

  const areaUnitRaw = String(fd.get("area_unit") ?? "ไร่");
  const area_unit: AreaUnit = (AREA_UNITS as readonly string[]).includes(areaUnitRaw)
    ? (areaUnitRaw as AreaUnit)
    : "ไร่";

  const planting_date = String(fd.get("planting_date") ?? "").trim() || null;
  const expected_harvest_date = String(fd.get("expected_harvest_date") ?? "").trim() || null;

  if (!name) throw new Error("กรุณากรอกชื่อแปลง");

  // Sanity-check years — a date picker/OS set to Thai (Buddhist) calendar can save a
  // year 543 too high (e.g. 2569 instead of 2026); reject rather than silently store
  // a ~500-year-out date that later shows as a nonsense "days to harvest" count.
  const thisYear = new Date().getFullYear();
  for (const [label, value] of [["วันที่เพาะปลูก", planting_date], ["วันที่คาดว่าจะเก็บเกี่ยว", expected_harvest_date]] as const) {
    if (!value) continue;
    const year = Number(value.slice(0, 4));
    if (!isNaN(year) && (year < thisYear - 50 || year > thisYear + 20)) {
      throw new Error(`${label}: ปี ${year} ดูผิดปกติ — ถ้าใช้ปี พ.ศ. กรุณาแปลงเป็น ค.ศ. ก่อนกรอก (เช่น พ.ศ. 2569 = ค.ศ. 2026)`);
    }
  }

  return { name, description, area, area_unit, crop_type, planting_date, expected_harvest_date };
}

/** Verify user owns the parent farm — returns farm.id if OK, else redirect. */
async function requireOwnedFarm(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  farmId: string
): Promise<void> {
  const { data } = await supabase
    .from("farms")
    .select("id")
    .eq("id", farmId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("ไม่พบฟาร์ม หรือคุณไม่มีสิทธิ์เข้าถึง");
}

export async function createZone(farmId: string, formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/dashboard/farms/${farmId}/zones/new`);

  await requireOwnedFarm(supabase, user.id, farmId);

  const check = await canCreateZone(supabase, user.id);
  if (!check.ok) throw new Error(check.reason ?? "เกินโควตาแพ็กเกจ");

  const fields = parseZoneFields(formData);
  const { data, error } = await supabase
    .from("zones")
    .insert({ ...fields, farm_id: farmId })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath(`/dashboard/farms/${farmId}`);
  revalidatePath(`/dashboard/farms/${farmId}/zones`);
  redirect(`/dashboard/farms/${farmId}/zones/${data.id}`);
}

export async function updateZone(
  farmId: string,
  zoneId: string,
  formData: FormData
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await requireOwnedFarm(supabase, user.id, farmId);

  const fields = parseZoneFields(formData);
  const { error } = await supabase
    .from("zones")
    .update(fields)
    .eq("id", zoneId)
    .eq("farm_id", farmId);
  if (error) throw new Error(error.message);

  revalidatePath(`/dashboard/farms/${farmId}/zones`);
  revalidatePath(`/dashboard/farms/${farmId}/zones/${zoneId}`);
  redirect(`/dashboard/farms/${farmId}/zones/${zoneId}`);
}

export async function archiveZone(farmId: string, zoneId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await requireOwnedFarm(supabase, user.id, farmId);

  const { error } = await supabase
    .from("zones")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", zoneId)
    .eq("farm_id", farmId);
  if (error) throw new Error(error.message);

  revalidatePath(`/dashboard/farms/${farmId}`);
  revalidatePath(`/dashboard/farms/${farmId}/zones`);
  redirect(`/dashboard/farms/${farmId}/zones`);
}

export async function restoreZone(farmId: string, zoneId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await requireOwnedFarm(supabase, user.id, farmId);

  const check = await canCreateZone(supabase, user.id);
  if (!check.ok) throw new Error(check.reason ?? "เกินโควตาแพ็กเกจ ไม่สามารถกู้คืนได้");

  const { error } = await supabase
    .from("zones")
    .update({ archived_at: null })
    .eq("id", zoneId)
    .eq("farm_id", farmId);
  if (error) throw new Error(error.message);

  revalidatePath(`/dashboard/farms/${farmId}/zones`);
  revalidatePath(`/dashboard/farms/${farmId}/zones/${zoneId}`);
  redirect(`/dashboard/farms/${farmId}/zones/${zoneId}`);
}

export async function deleteZone(farmId: string, zoneId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await requireOwnedFarm(supabase, user.id, farmId);

  const { error } = await supabase
    .from("zones")
    .delete()
    .eq("id", zoneId)
    .eq("farm_id", farmId);
  if (error) throw new Error(error.message);

  revalidatePath(`/dashboard/farms/${farmId}`);
  revalidatePath(`/dashboard/farms/${farmId}/zones`);
  redirect(`/dashboard/farms/${farmId}/zones`);
}
