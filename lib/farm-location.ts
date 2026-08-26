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
