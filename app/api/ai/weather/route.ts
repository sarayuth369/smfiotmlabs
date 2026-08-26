import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPlan, hasFeature } from "@/lib/plan-limits";
import { getFarmLocation } from "@/lib/farm-location";
import { getWeatherWithCache } from "@/lib/weather";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const plan = await getUserPlan(supabase, user.id);
  if (!hasFeature(plan, "ai")) {
    return NextResponse.json({ error: "Weather intelligence is not available on your current plan." }, { status: 403 });
  }

  const farmId = new URL(req.url).searchParams.get("farm_id");
  if (!farmId) return NextResponse.json({ error: "farm_id is required" }, { status: 400 });

  const farm = await getFarmLocation(supabase, user.id, farmId);
  if (!farm) return NextResponse.json({ error: "ไม่พบฟาร์ม หรือคุณไม่มีสิทธิ์เข้าถึง" }, { status: 404 });

  if (farm.latitude === null || farm.longitude === null) {
    return NextResponse.json({ farm, located: false });
  }

  const admin = createAdminClient();
  const result = await getWeatherWithCache(admin, farm.latitude, farm.longitude);

  return NextResponse.json({
    farm,
    located: true,
    weather: result.snapshot,
    flood_risk: result.floodRisk,
    stale: result.stale,
    error: result.error,
  });
}
