import { NextResponse } from "next/server";
import { authenticateApiRequest, requirePermission, resolveScopedDeviceIds, apiErrorResponse } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Latest reading per sensor across the account (or one device) — reuses the existing realtime cache table, same source the dashboard's Live views read from. */
export async function GET(req: Request) {
  const auth = await authenticateApiRequest(req);
  if (!auth.ok) return apiErrorResponse(auth);
  const { ctx } = auth;

  const permErr = requirePermission(ctx, "READ_READINGS");
  if (permErr) return apiErrorResponse(permErr);

  const deviceIds = await resolveScopedDeviceIds(ctx);
  if (deviceIds.length === 0) return NextResponse.json({ readings: [] });

  const url = new URL(req.url);
  const deviceIdFilter = url.searchParams.get("device_id");
  if (deviceIdFilter && !deviceIds.includes(deviceIdFilter)) {
    return NextResponse.json({ error: "device not found" }, { status: 404 });
  }

  const { data, error } = await ctx.admin
    .from("sensor_readings_latest")
    .select("sensor_id, device_id, value, unit, occurred_at, received_at")
    .in("device_id", deviceIdFilter ? [deviceIdFilter] : deviceIds);
  if (error) return NextResponse.json({ error: "query failed" }, { status: 500 });

  return NextResponse.json({ readings: data ?? [] });
}
