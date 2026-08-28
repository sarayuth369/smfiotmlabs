"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/admin/current";
import { saveSupportAiConfig, saveSupportLineSettings, type SupportAiConfig, type SupportProviderId } from "@/lib/support/settings";
import type { LineSettings, LineMode } from "@/lib/admin/settings";

export async function updateSupportAiConfig(formData: FormData): Promise<void> {
  const session = await requireModule("support_chat");

  const rawProvider = formData.get("provider");
  const provider: SupportProviderId = rawProvider === "openai" ? "openai" : "groq";

  const config: SupportAiConfig = {
    enabled: formData.get("enabled") === "on",
    provider,
    groq_model: String(formData.get("groq_model") ?? "").trim() || "openai/gpt-oss-120b",
    openai_model: String(formData.get("openai_model") ?? "").trim() || "gpt-4o-mini",
    assistant_name: String(formData.get("assistant_name") ?? "").trim() || "น้องเอส",
    welcome_message: String(formData.get("welcome_message") ?? "").trim() || "สวัสดีค่ะ 😊 มีอะไรให้ SMF IoT Support ช่วยไหมคะ?",
    tone: String(formData.get("tone") ?? "").trim() || "สุภาพ เป็นกันเอง กระชับ",
    max_response_length: Math.max(100, Number(formData.get("max_response_length")) || 600),
    escalation_after_turns: Math.max(1, Number(formData.get("escalation_after_turns")) || 4),
  };

  const { error } = await saveSupportAiConfig(config, session.id);
  if (error) console.warn("[admin.support.ai.update] db error", error);

  revalidatePath("/admin/support");
}

export async function updateSupportLineSettings(formData: FormData): Promise<void> {
  const session = await requireModule("support_chat");

  const rawMode = formData.get("mode");
  const mode: LineMode = rawMode === "broadcast" || rawMode === "group" ? rawMode : "user";

  const settings: LineSettings = {
    channel_access_token: String(formData.get("channel_access_token") ?? "").trim(),
    mode,
    target_id: String(formData.get("target_id") ?? "").trim(),
    enabled: formData.get("line_enabled") === "on",
  };

  const { error } = await saveSupportLineSettings(settings, session.id);
  if (error) console.warn("[admin.support.line.update] db error", error);

  revalidatePath("/admin/support");
}
