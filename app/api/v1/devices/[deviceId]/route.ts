import { NextResponse } from "next/server";
import { authenticateApiRequest, requirePermission, resolveScopedDevice, apiErrorResponse } from "@/lib/api-auth";
import { computeDeviceStatus } from "@/lib/device-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ deviceId: string }> }) {
  const auth = await authenticateApiRequest(req);
  if (!auth.ok) return apiErrorResponse(auth);
  const { ctx } = auth;

  const permErr = requirePermission(ctx, "READ_DEVICES");
  if (permErr) return apiErrorResponse(permErr);

  const { deviceId } = await params;
  const resolved = await resolveScopedDevice(ctx, deviceId);
  if (!resolved.ok) return apiErrorResponse(resolved);

  const d = resolved.device;
  return NextResponse.json({
    device: {
      id: d.id,
      device_uid: d.device_uid,
      device_name: d.device_name,
      status: computeDeviceStatus(d.status, d.last_seen),
      last_seen: d.last_seen,
    },
  });
}
