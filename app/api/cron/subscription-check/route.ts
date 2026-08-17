import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GRACE_DAYS = parseInt(process.env.SUBSCRIPTION_GRACE_DAYS ?? "7", 10) || 7;

type ProfileRow = {
  id: string;
  plan: string | null;
  plan_expires_at: string | null;
  grace_period_end: string | null;
  sub_notified_expiring_7: string | null;
  sub_notified_expiring_1: string | null;
  sub_notified_expired: string | null;
};

/**
 * Vercel Cron entrypoint. Runs daily.
 * Protected by CRON_SECRET header (Vercel Cron sets Authorization: Bearer <CRON_SECRET>).
 * Idempotent — safe to re-run.
 */
export async function GET(req: Request) {
  const authz = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const in1d = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString();

  // Scan candidates — paid plans with expiry set (starter/enterprise skipped)
  const { data, error } = await admin
    .from("profiles")
    .select(
      "id, plan, plan_expires_at, grace_period_end, sub_notified_expiring_7, sub_notified_expiring_1, sub_notified_expired"
    )
    .in("plan", ["pro", "business"])
    .not("plan_expires_at", "is", null);

  if (error) {
    console.warn("[cron.subscription-check] scan error", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as ProfileRow[];
  const stats = {
    scanned: rows.length,
    notified_expiring_7: 0,
    notified_expiring_1: 0,
    grace_started: 0,
    downgraded: 0,
    errors: [] as string[],
  };

  for (const p of rows) {
    if (!p.plan_expires_at) continue;
    try {
      const exp = new Date(p.plan_expires_at).getTime();
      const nowMs = now.getTime();

      // 1. Expiring in ≤7d, ≤1d — notification only
      if (exp > nowMs && p.plan_expires_at <= in7d && !p.sub_notified_expiring_7) {
        await admin.from("notifications").insert({
          user_id: p.id,
          title: "แพ็กเกจใกล้หมดอายุ",
          message: `แพ็กเกจของคุณจะหมดอายุใน ${Math.ceil((exp - nowMs) / 86400000)} วัน กรุณาต่ออายุเพื่อใช้งานต่อเนื่อง`,
        });
        await admin
          .from("profiles")
          .update({ sub_notified_expiring_7: nowIso })
          .eq("id", p.id);
        stats.notified_expiring_7++;
      }

      if (exp > nowMs && p.plan_expires_at <= in1d && !p.sub_notified_expiring_1) {
        await admin.from("notifications").insert({
          user_id: p.id,
          title: "แพ็กเกจหมดอายุพรุ่งนี้",
          message: "แพ็กเกจของคุณจะหมดอายุภายใน 24 ชั่วโมง — โปรดต่ออายุด่วน",
        });
        await admin
          .from("profiles")
          .update({ sub_notified_expiring_1: nowIso })
          .eq("id", p.id);
        stats.notified_expiring_1++;
      }

      // 2. Just expired — start grace period (if not already started)
      if (exp <= nowMs && !p.grace_period_end) {
        const graceEnd = new Date(exp + GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();
        await admin
          .from("profiles")
          .update({ grace_period_end: graceEnd })
          .eq("id", p.id);
        if (!p.sub_notified_expired) {
          await admin.from("notifications").insert({
            user_id: p.id,
            title: "แพ็กเกจหมดอายุแล้ว",
            message: `แพ็กเกจของคุณหมดอายุ — คุณสามารถใช้งานต่อได้อีก ${GRACE_DAYS} วัน (Grace Period) กรุณาต่ออายุเพื่อใช้งานต่อเนื่อง`,
          });
          await admin
            .from("profiles")
            .update({ sub_notified_expired: nowIso })
            .eq("id", p.id);
        }
        await admin.from("subscription_events").insert({
          user_id: p.id,
          event_type: "grace_started",
          from_plan: p.plan,
          to_plan: p.plan,
          actor_type: "system",
          metadata: { grace_period_end: graceEnd, expired_at: p.plan_expires_at },
        });
        stats.grace_started++;
      }

      // 3. Past grace — downgrade to starter
      const graceEndMs = p.grace_period_end
        ? new Date(p.grace_period_end).getTime()
        : exp + GRACE_DAYS * 24 * 60 * 60 * 1000;
      if (nowMs > graceEndMs) {
        await admin
          .from("profiles")
          .update({
            plan: "starter",
            plan_expires_at: null,
            grace_period_end: null,
            sub_notified_expiring_7: null,
            sub_notified_expiring_1: null,
            sub_notified_expired: null,
          })
          .eq("id", p.id);
        await admin.from("notifications").insert({
          user_id: p.id,
          title: "เปลี่ยนเป็นแพ็กเกจ Starter",
          message: "แพ็กเกจของคุณหมดอายุและ Grace Period หมดลง ระบบเปลี่ยนเป็น Starter — ข้อมูลเดิมยังอยู่ครบ. อัปเกรดเพื่อเปิดใช้งานเต็มรูปแบบ",
        });
        await admin.from("subscription_events").insert({
          user_id: p.id,
          event_type: "downgraded",
          from_plan: p.plan,
          to_plan: "starter",
          actor_type: "system",
          metadata: { reason: "grace_period_ended", grace_period_ended_at: p.grace_period_end },
        });
        stats.downgraded++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[cron.subscription-check] row error", p.id, msg);
      stats.errors.push(`${p.id}: ${msg}`);
    }
  }

  return NextResponse.json({ ok: true, ranAt: nowIso, ...stats });
}
