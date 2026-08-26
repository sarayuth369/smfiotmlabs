import { NextResponse } from "next/server";
import { authenticateApiRequest, requirePermission, resolveScopedDevice, apiErrorResponse } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ deviceId: string }> }) {
  const auth = await authenticateApiRequest(req);
  if (!auth.ok) return apiErrorResponse(auth);
  const { ctx } = auth;

  const permErr = requirePermission(ctx, "READ_SENSORS");
  if (permErr) return apiErrorResponse(permErr);

  const { deviceId } = await params;
  const resolved = await resolveScopedDevice(ctx, deviceId);
  if (!resolved.ok) return apiErrorResponse(resolved);

  const { data } = await ctx.admin
    .from("sensors")
    .select("id, name, sensor_type, unit, channel, status")
    .eq("device_id", deviceId)
    .is("archived_at", null)
    .order("created_at");

  return NextResponse.json({ sensors: data ?? [] });
}
