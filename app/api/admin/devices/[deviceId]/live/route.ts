import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/current";
import { canAccess } from "@/lib/admin/rbac";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Live poll target for the admin devices table (rssi + status only —
 * the same two fields the table's WiFi/Status cells show, refreshed the
 * same way LiveSensorValue polls sensor_readings_latest every 5s).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const session = await getAdminSession();
  if (!session || !canAccess(session.role, "devices")) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { deviceId } = await params;
  const admin = createAdminClient();
  const { data } = await admin
    .from("iot_nodes")
    .select("status, rssi, last_seen")
    .eq("id", deviceId)
    .maybeSingle();
  if (!data) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    status: data.status,
    rssi: data.rssi,
    last_seen: data.last_seen,
  });
}
