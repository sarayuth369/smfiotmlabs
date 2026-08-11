"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/admin/current";
import { getLineSettings, isLineReady } from "@/lib/admin/settings";
import { broadcastLineText, pushLineText } from "@/lib/line";

const VALID_PLANS = ["starter", "pro", "business", "enterprise"] as const;
const VALID_CHANNELS = ["web", "line"] as const;

export async function sendAnnouncement(formData: FormData): Promise<void> {
  const session = await requireModule("notifications");

  const title = String(formData.get("title") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const targetsRaw = formData.getAll("targets").map((t) => String(t));
  const channelsRaw = formData.getAll("channels").map((c) => String(c));

  if (!title || !message) {
    console.warn("[notifications.send] missing title or message");
    return;
  }

  // Normalize targets: 'all' means everyone; otherwise filter to valid plan ids
  const isAll = targetsRaw.includes("all");
  const targetPlans = isAll
    ? ["all"]
    : targetsRaw.filter((t): t is (typeof VALID_PLANS)[number] =>
        (VALID_PLANS as readonly string[]).includes(t)
      );
  const channels = channelsRaw.filter((c): c is (typeof VALID_CHANNELS)[number] =>
    (VALID_CHANNELS as readonly string[]).includes(c)
  );

  if (targetPlans.length === 0 || channels.length === 0) {
    console.warn("[notifications.send] no target or channel selected");
    return;
  }

  const admin = createAdminClient();

  const { data: ann, error: insertErr } = await admin
    .from("announcements")
    .insert({
      title,
      message,
      target_plans: targetPlans,
      channels,
      status: "sent",
      created_by: session.id,
    })
    .select("id")
    .single();

  if (insertErr || !ann) {
    console.warn("[notifications.send] insert error", insertErr);
    return;
  }

  let webCount = 0;
  let lineError: string | null = null;

  // Web fanout
  if (channels.includes("web")) {
    let q = admin.from("profiles").select("id");
    if (!isAll) q = q.in("plan", targetPlans);
    const { data: users } = await q;

    if (users && users.length > 0) {
      const rows = users.map((u: { id: string }) => ({
        user_id: u.id,
        announcement_id: ann.id,
        title,
        message,
      }));
      // Insert in chunks of 500 to stay under any request limits
      const chunk = 500;
      for (let i = 0; i < rows.length; i += chunk) {
        const batch = rows.slice(i, i + chunk);
        const { error: fanoutErr } = await admin.from("notifications").insert(batch);
        if (fanoutErr) {
          console.warn("[notifications.send] fanout batch error", fanoutErr);
        } else {
          webCount += batch.length;
        }
      }
    }
  }

  // LINE broadcast / push
  if (channels.includes("line")) {
    const line = await getLineSettings();
    if (!isLineReady(line)) {
      lineError = "LINE ยังไม่ถูกตั้งค่า / ปิดใช้งานอยู่";
    } else {
      const text = `📢 ${title}\n\n${message}`;
      const res =
        line.mode === "broadcast"
          ? await broadcastLineText(line.channel_access_token, text)
          : await pushLineText(line.channel_access_token, line.target_id, text);
      if (!res.ok) lineError = res.error;
    }
  }

  const status = lineError
    ? channels.includes("web") && webCount > 0
      ? "partial"
      : "failed"
    : "sent";

  await admin
    .from("announcements")
    .update({
      web_recipients_count: webCount,
      line_error: lineError,
      status,
    })
    .eq("id", ann.id);

  revalidatePath("/admin/notifications");
  revalidatePath("/dashboard");
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await requireModule("notifications");
  const admin = createAdminClient();
  await admin.from("announcements").delete().eq("id", id);
  revalidatePath("/admin/notifications");
}
