"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/admin/current";
import {
  saveLineSettings,
  getLineSettings,
  isLineReady,
  type LineMode,
} from "@/lib/admin/settings";
import { broadcastLineText, pushLineText } from "@/lib/line";

export async function updateLineSettings(formData: FormData): Promise<void> {
  const session = await requireModule("settings");

  const channel_access_token = String(formData.get("channel_access_token") ?? "").trim();
  const modeRaw = String(formData.get("mode") ?? "broadcast");
  const mode: LineMode =
    modeRaw === "group" || modeRaw === "user" || modeRaw === "broadcast"
      ? modeRaw
      : "broadcast";
  const target_id = String(formData.get("target_id") ?? "").trim();
  const enabled = formData.get("enabled") === "on";

  const { error } = await saveLineSettings(
    { channel_access_token, mode, target_id, enabled },
    session.id
  );
  if (error) console.warn("[settings.line.save] db error", error);

  revalidatePath("/admin/settings/line");
  revalidatePath("/admin/notifications");
}

export async function sendLineTest(): Promise<void> {
  await requireModule("settings");
  const line = await getLineSettings();
  if (!isLineReady(line)) {
    console.warn("[settings.line.test] LINE not ready");
    return;
  }
  const text = "🧪 SMF IoT — ทดสอบการเชื่อมต่อ LINE สำเร็จ";
  const res =
    line.mode === "broadcast"
      ? await broadcastLineText(line.channel_access_token, text)
      : await pushLineText(line.channel_access_token, line.target_id, text);
  if (!res.ok) console.warn("[settings.line.test] send error", res.error);
}
