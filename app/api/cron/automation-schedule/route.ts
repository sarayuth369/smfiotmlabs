import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateScheduleRules } from "@/lib/automation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vercel Cron — fires schedule-type automation_rules whose next_run_at has arrived.
 * Sensor-value rules are evaluated inline in /api/telemetry/ingest instead; schedule
 * rules need this separate tick since nothing else calls in at the scheduled instant.
 */
export async function GET(req: Request) {
  const authz = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  try {
    const stats = await evaluateScheduleRules(admin);
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), ...stats });
  } catch (e) {
    console.warn("[cron.automation-schedule] error", (e as Error).message);
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
