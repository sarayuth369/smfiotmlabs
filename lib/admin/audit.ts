/**
 * Phase 6.8 — lightweight audit log for admin MQTT/bridge actions.
 * Never pass password/token/secret values into `detail` — this is
 * enforced by callers, not sanitized here, so double-check every call site.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminSession } from "@/lib/admin/session";

export type AuditAction =
  | "mqtt_user_create"
  | "mqtt_user_disable"
  | "mqtt_user_enable"
  | "mqtt_user_delete"
  | "mqtt_user_rotate_password"
  | "mqtt_bridge_restart";

export async function logAdminAction(
  session: AdminSession,
  action: AuditAction,
  target: string,
  result: "success" | "failure",
  detail?: string
): Promise<void> {
  const admin = createAdminClient();
  await admin.from("admin_audit_log").insert({
    admin_id: session.id,
    admin_username: session.username,
    action,
    target,
    result,
    detail: detail?.slice(0, 500) ?? null,
  });
}
