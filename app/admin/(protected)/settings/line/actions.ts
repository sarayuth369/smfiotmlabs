"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/admin/current";
import { saveLineSettings, getLineSettings } from "@/lib/admin/settings";
import { pushLineText } from "@/lib/line";

export async function updateLineSettings(formData: FormData): Promise<void> {
  const session = await requireModule("settings");

  const channel_access_token = String(formData.get("channel_access_token") ?? "").trim();
  const group_id = String(formData.get("group_id") ?? "").trim();
  const enabled = formData.get("enabled") === "on";

  const { error } = await saveLineSettings(
    { channel_access_token, group_id, enabled },
    session.id
  );
  if (error) console.warn("[settings.line.save] db error", error);

  revalidatePath("/admin/settings/line");
  revalidatePath("/admin/notifications");
}

export async function sendLineTest(): Promise<void> {
  await requireModule("settings");
  const line = await getLineSettings();
  if (!line.channel_access_token || !line.group_id) {
    console.warn("[settings.line.test] missing token or group id");
    return;
  }
  const res = await pushLineText(
    line.channel_access_token,
    line.group_id,
    "🧪 SMF IoT — ทดสอบการเชื่อมต่อ LINE สำเร็จ"
  );
  if (!res.ok) console.warn("[settings.line.test] push error", res.error);
}
