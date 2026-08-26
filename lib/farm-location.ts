/** FarmDataProvider — thin wrapper over the existing farms table, no new schema. */

import type { SupabaseClient } from "@supabase/supabase-js";

export type FarmLocation = {
  id: string;
  name: string;
  province: string | null;
  district: string | null;
  subdistrict: string | null;
  latitude: number | null;
  longitude: number | null;
};

export async function getFarmLocation(supabase: SupabaseClient, userId: string, farmId: string): Promise<FarmLocation | null> {
  const { data } = await supabase
    .from("farms")
    .select("id, name, province, district, subdistrict, latitude, longitude")
    .eq("id", farmId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    name: data.name as string,
    province: data.province as string | null,
    district: data.district as string | null,
    subdistrict: data.subdistrict as string | null,
    latitude: data.latitude as number | null,
    longitude: data.longitude as number | null,
  };
}

/** Resolves a device's owning farm id — used to scope weather to whatever farm the AI page's current device selection belongs to. */
export async function getFarmIdForDevice(supabase: SupabaseClient, userId: string, deviceId: string): Promise<string | null> {
  const { data } = await supabase
    .from("iot_nodes")
    .select("farm_id, farms!inner(user_id)")
    .eq("id", deviceId)
    .maybeSingle();
  const farmRel = (data as unknown as { farms: { user_id: string } | { user_id: string }[] } | null)?.farms;
  const ownerId = Array.isArray(farmRel) ? farmRel[0]?.user_id : farmRel?.user_id;
  if (!data || ownerId !== userId) return null;
  return data.farm_id as string;
}

export type ZoneInfo = {
  id: string;
  name: string;
  crop_type: string | null;
  planting_date: string | null;
  expected_harvest_date: string | null;
  area: number | null;
  area_unit: string | null;
};

function toZoneInfo(row: Record<string, unknown>): ZoneInfo {
  return {
    id: row.id as string,
    name: row.name as string,
    crop_type: row.crop_type as string | null,
    planting_date: row.planting_date as string | null,
    expected_harvest_date: row.expected_harvest_date as string | null,
    area: row.area as number | null,
    area_unit: row.area_unit as string | null,
  };
}

const ZONE_COLUMNS = "id, name, crop_type, planting_date, expected_harvest_date, area, area_unit";

/** Zone a specific device sits in, if assigned — the primary path (single-device AI Analysis scope). */
export async function getZoneForDevice(supabase: SupabaseClient, userId: string, deviceId: string): Promise<ZoneInfo | null> {
  const { data } = await supabase
    .from("iot_nodes")
    .select(`zone_id, farms!inner(user_id), zones(${ZONE_COLUMNS})`)
    .eq("id", deviceId)
    .maybeSingle();
  const farmRel = (data as unknown as { farms: { user_id: string } | { user_id: string }[] } | null)?.farms;
  const ownerId = Array.isArray(farmRel) ? farmRel[0]?.user_id : farmRel?.user_id;
  if (!data || ownerId !== userId || !data.zone_id) return null;
  const zoneRel = (data as unknown as { zones: Record<string, unknown> | Record<string, unknown>[] | null }).zones;
  const zone = Array.isArray(zoneRel) ? zoneRel[0] : zoneRel;
  if (!zone) return null;
  return toZoneInfo(zone);
}

/** Farm-wide (Business+ "all devices") scope has no single device to key off — best-effort: the first active zone that has a crop set, else the first active zone, else null. */
export async function getPrimaryZoneForFarm(supabase: SupabaseClient, userId: string, farmId: string): Promise<ZoneInfo | null> {
  const { data: farm } = await supabase.from("farms").select("id").eq("id", farmId).eq("user_id", userId).maybeSingle();
  if (!farm) return null;

  const { data } = await supabase
    .from("zones")
    .select(ZONE_COLUMNS)
    .eq("farm_id", farmId)
    .is("archived_at", null)
    .order("crop_type", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return toZoneInfo(data as Record<string, unknown>);
}

/** Real elapsed-days math from a real date — never estimate a crop's maturity period. Negative = past due. */
export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr).getTime();
  if (isNaN(target)) return null;
  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - todayUtc) / 86_400_000);
}
