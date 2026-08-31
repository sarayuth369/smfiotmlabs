import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sweepDeviceHealth } from "@/lib/device-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vercel Cron entrypoint. Detects health changes caused purely by time
 * passing (device gone silent, sensor gone stale) — nothing else triggers
 * that on its own since ingest only evaluates on an incoming packet.
 * Protected by CRON_SECRET, same convention as the other cron routes.
 */
export async function GET(req: Request) {
  const authz = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const result = await sweepDeviceHealth(admin);
  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), ...result });
}
