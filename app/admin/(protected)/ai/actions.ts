"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/admin/current";
import { saveAiConfig, type AiConfig, type AiProviderId } from "@/lib/admin/ai-settings";

export async function updateAiConfig(formData: FormData): Promise<void> {
  const session = await requireModule("ai");

  const rawProvider = formData.get("default_provider");
  const default_provider: AiProviderId = rawProvider === "openai" ? "openai" : rawProvider === "groq" ? "groq" : "gemini";
  const config: AiConfig = {
    default_provider,
    gemini_enabled: formData.get("gemini_enabled") === "on",
    gemini_model: String(formData.get("gemini_model") ?? "").trim() || "gemini-3.5-flash-lite",
    openai_enabled: formData.get("openai_enabled") === "on",
    openai_model: String(formData.get("openai_model") ?? "").trim() || "gpt-4o-mini",
    groq_enabled: formData.get("groq_enabled") === "on",
    groq_model: String(formData.get("groq_model") ?? "").trim() || "llama-3.3-70b-versatile",
  };

  const { error } = await saveAiConfig(config, session.id);
  if (error) console.warn("[admin.ai.update] db error", error);

  revalidatePath("/admin/ai");
  revalidatePath("/dashboard/ai-analysis");
}
