import { NextResponse } from "next/server";
import { authenticateApiRequest, requirePermission, resolveScopedDeviceIds, apiErrorResponse } from "@/lib/api-auth";
import { computeDeviceStatus } from "@/lib/device-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await authenticateApiRequest(req);
  if (!auth.ok) return apiErrorResponse(auth);
  const { ctx } = auth;

  const permErr = requirePermission(ctx, "READ_DEVICES");
  if (permErr) return apiErrorResponse(permErr);

  const deviceIds = await resolveScopedDeviceIds(ctx);
  if (deviceIds.length === 0) return NextResponse.json({ devices: [] });

  const { data } = await ctx.admin
    .from("iot_nodes")
    .select("id, device_uid, device_name, model, status, last_seen, created_at")
    .in("id", deviceIds)
    .order("device_name");

  const devices = (data ?? []).map((d) => ({
    id: d.id,
    device_uid: d.device_uid,
    device_name: d.device_name,
    model: d.model,
    status: computeDeviceStatus(d.status as string, d.last_seen as string | null),
    last_seen: d.last_seen,
    created_at: d.created_at,
  }));

  return NextResponse.json({ devices });
}
