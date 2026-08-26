import { NextResponse } from "next/server";
import { authenticateApiRequest, requirePermission, resolveScopedDevice, apiErrorResponse } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 2000; // matches the Reports page's own query cap — prevents an unbounded Supabase scan

export async function GET(req: Request, { params }: { params: Promise<{ deviceId: string }> }) {
  const auth = await authenticateApiRequest(req);
  if (!auth.ok) return apiErrorResponse(auth);
  const { ctx } = auth;

  const permErr = requirePermission(ctx, "READ_READINGS");
  if (permErr) return apiErrorResponse(permErr);

  const { deviceId } = await params;
  const resolved = await resolveScopedDevice(ctx, deviceId);
  if (!resolved.ok) return apiErrorResponse(resolved);

  const url = new URL(req.url);
  const sensorId = url.searchParams.get("sensor_id");
  const limit = Math.min(MAX_ROWS, Math.max(1, Number(url.searchParams.get("limit")) || 500));

  // Retention: never let a caller ask further back than their plan allows,
  // regardless of a `since` query param they might pass.
  const retentionDays = ctx.plan.limits.sensor_history_days;
  const retentionFloor = retentionDays === null ? null : new Date(Date.now() - retentionDays * 86_400_000);
  const requestedSince = url.searchParams.get("since") ? new Date(url.searchParams.get("since")!) : null;
  const since =
    requestedSince && !isNaN(requestedSince.getTime())
      ? retentionFloor && requestedSince < retentionFloor
        ? retentionFloor
        : requestedSince
      : retentionFloor;

  let query = ctx.admin
    .from("sensor_readings")
    .select("sensor_id, value, unit, occurred_at")
    .eq("device_id", deviceId)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (sensorId) query = query.eq("sensor_id", sensorId);
  if (since) query = query.gte("occurred_at", since.toISOString());

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "query failed" }, { status: 500 });

  return NextResponse.json({
    device_id: deviceId,
    retention_days: retentionDays,
    count: data?.length ?? 0,
    readings: data ?? [],
  });
}
