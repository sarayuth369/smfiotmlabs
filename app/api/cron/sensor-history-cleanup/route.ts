import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DELETE_BATCH = 200;

/**
 * Vercel Cron — daily retention cleanup for opt-in sensor_readings history.
 * Deletes rows older than each customer's plan retention (sensor_history_days).
 * Scoped strictly per farm owner (farms -> iot_nodes -> sensors -> sensor_readings)
 * so one customer's cleanup can never touch another's rows. Idempotent — re-running
 * with the same cutoff just finds nothing left to delete.
 */
export async function GET(req: Request) {
  const authz = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowMs = Date.now();

  const { data: farms, error: farmsErr } = await admin.from("farms").select("id, user_id");
  if (farmsErr) {
    return NextResponse.json({ ok: false, error: farmsErr.message }, { status: 500 });
  }

  const ownerIds = [...new Set((farms ?? []).map((f) => f.user_id as string))];
  const stats = { owners: ownerIds.length, deleted: 0, skipped_unlimited: 0, errors: [] as string[] };

  for (const ownerId of ownerIds) {
    try {
      const { data: profile } = await admin.from("profiles").select("plan").eq("id", ownerId).maybeSingle();
      const { data: planRow } = await admin
        .from("subscription_plans")
        .select("sensor_history_days")
        .eq("plan_id", (profile?.plan as string) ?? "starter")
        .maybeSingle();
      const retentionDays = planRow?.sensor_history_days as number | null | undefined;

      if (!retentionDays) {
        // null = unlimited retention (e.g. enterprise) — nothing to clean up
        stats.skipped_unlimited++;
        continue;
      }

      const ownerFarmIds = (farms ?? []).filter((f) => f.user_id === ownerId).map((f) => f.id as string);
      const { data: devices } = await admin.from("iot_nodes").select("id").in("farm_id", ownerFarmIds);
      const deviceIds = (devices ?? []).map((d) => d.id as string);
      if (deviceIds.length === 0) continue;

      const { data: sensors } = await admin.from("sensors").select("id").in("device_id", deviceIds);
      const sensorIds = (sensors ?? []).map((s) => s.id as string);
      if (sensorIds.length === 0) continue;

      const cutoff = new Date(nowMs - retentionDays * 86_400_000).toISOString();

      for (let i = 0; i < sensorIds.length; i += DELETE_BATCH) {
        const batch = sensorIds.slice(i, i + DELETE_BATCH);
        const { error: delErr, count } = await admin
          .from("sensor_readings")
          .delete({ count: "exact" })
          .in("sensor_id", batch)
          .lt("occurred_at", cutoff);
        if (delErr) throw new Error(delErr.message);
        stats.deleted += count ?? 0;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[cron.sensor-history-cleanup] owner error", ownerId, msg);
      stats.errors.push(`${ownerId}: ${msg}`);
    }
  }

  // Automation execution log retention — flat 90-day window (not plan-tied, keeps this
  // cheap and simple; the log is diagnostic/activity-feed data, not billable history).
  let automationLogsDeleted = 0;
  try {
    const cutoff = new Date(nowMs - 90 * 86_400_000).toISOString();
    const { count } = await admin.from("automation_logs").delete({ count: "exact" }).lt("executed_at", cutoff);
    automationLogsDeleted = count ?? 0;
  } catch (e) {
    stats.errors.push(`automation_logs cleanup: ${(e as Error).message}`);
  }

  return NextResponse.json({ ok: true, ranAt: new Date(nowMs).toISOString(), ...stats, automationLogsDeleted });
}
