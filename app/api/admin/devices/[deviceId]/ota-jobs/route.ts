import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/current";
import { canAccess } from "@/lib/admin/rbac";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Live poll target for the OTA history list on the admin device detail
 * page — same shape/cadence idea as the devices-table live route, just
 * for firmware_update_jobs instead of status/rssi.
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
    .from("firmware_update_jobs")
    .select("id, state, progress, from_version, to_version, error_message, created_at, completed_at")
    .eq("device_id", deviceId)
    .order("created_at", { ascending: false })
    .limit(10);

  return NextResponse.json({ ok: true, jobs: data ?? [] });
}
