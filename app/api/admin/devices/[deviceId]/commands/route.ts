import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/current";
import { canAccess } from "@/lib/admin/rbac";
import { createAdminClient } from "@/lib/supabase/admin";

/** Live poll target for the Command History table on the admin device detail page. */
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
    .from("device_commands")
    .select("id, command, status, requested_by, user_id, payload, result, error_message, requested_at, sent_at, acknowledged_at, completed_at")
    .eq("device_id", deviceId)
    .order("requested_at", { ascending: false })
    .limit(20);

  return NextResponse.json({ ok: true, commands: data ?? [] });
}
