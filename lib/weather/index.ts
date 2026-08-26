/**
 * Weather facade — the only thing the rest of the app imports. Swapping
 * providers later (TMD, a commercial API) means changing PROVIDER below,
 * nothing else. DB-backed cache (not in-memory) because serverless
 * function instances don't share memory reliably across invocations.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { WeatherSnapshot } from "./types";
import { OpenMeteoProvider } from "./open-meteo";
import { HeuristicFloodRiskProvider, type FloodRisk } from "./flood-risk";
import { getFarmLocation, type FarmLocation } from "@/lib/farm-location";

const PROVIDER = new OpenMeteoProvider();
const FLOOD_PROVIDER = new HeuristicFloodRiskProvider();
const CACHE_TTL_MINUTES = 20;

function cacheKey(lat: number, lon: number): string {
  // ~1km precision — farms near each other reuse the same cached call.
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

export type WeatherResult = {
  snapshot: WeatherSnapshot | null;
  floodRisk: FloodRisk | null;
  stale: boolean;
  error: string | null;
};

export async function getWeatherWithCache(admin: SupabaseClient, lat: number, lon: number): Promise<WeatherResult> {
  const key = cacheKey(lat, lon);
  const fresh = new Date(Date.now() - CACHE_TTL_MINUTES * 60_000).toISOString();

  const { data: cached } = await admin.from("weather_cache").select("payload, fetched_at").eq("cache_key", key).maybeSingle();

  if (cached && (cached.fetched_at as string) >= fresh) {
    const snapshot = cached.payload as WeatherSnapshot;
    return { snapshot, floodRisk: FLOOD_PROVIDER.deriveRisk(snapshot.daily), stale: false, error: null };
  }

  try {
    const snapshot = await PROVIDER.getWeather(lat, lon);
    await admin
      .from("weather_cache")
      .upsert({ cache_key: key, latitude: lat, longitude: lon, payload: snapshot, fetched_at: snapshot.fetched_at }, { onConflict: "cache_key" });
    return { snapshot, floodRisk: FLOOD_PROVIDER.deriveRisk(snapshot.daily), stale: false, error: null };
  } catch (e) {
    // Provider down — fall back to stale cache if we have ANY, rather than
    // breaking the whole dashboard section.
    if (cached) {
      const snapshot = cached.payload as WeatherSnapshot;
      return { snapshot, floodRisk: FLOOD_PROVIDER.deriveRisk(snapshot.daily), stale: true, error: null };
    }
    return { snapshot: null, floodRisk: null, stale: false, error: e instanceof Error ? e.message : "weather unavailable" };
  }
}

/** Composite type the AI prompt builder accepts — farm + weather + derived flood risk together. */
export type WeatherPromptContext = { farm: FarmLocation; weather: WeatherSnapshot; floodRisk: FloodRisk };

/** Best-effort — returns null on ANY failure (no location, provider down with no cache, etc.) rather than throwing, so a weather hiccup never breaks analyze/chat. */
export async function getWeatherPromptContext(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  userId: string,
  farmId: string | null
): Promise<WeatherPromptContext | null> {
  if (!farmId) return null;
  try {
    const farm = await getFarmLocation(supabase, userId, farmId);
    if (!farm || farm.latitude === null || farm.longitude === null) return null;
    const result = await getWeatherWithCache(admin, farm.latitude, farm.longitude);
    if (!result.snapshot || !result.floodRisk) return null;
    return { farm, weather: result.snapshot, floodRisk: result.floodRisk };
  } catch {
    return null;
  }
}
