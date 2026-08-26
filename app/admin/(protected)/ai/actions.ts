"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/admin/current";
import { saveAiConfig, type AiConfig, type AiProviderId } from "@/lib/admin/ai-settings";

export async function updateAiConfig(formData: FormData): Promise<void> {
  const session = await requireModule("ai");

  const default_provider: AiProviderId = formData.get("default_provider") === "openai" ? "openai" : "gemini";
  const config: AiConfig = {
    default_provider,
    gemini_enabled: formData.get("gemini_enabled") === "on",
    gemini_model: String(formData.get("gemini_model") ?? "").trim() || "gemini-3.5-flash-lite",
    openai_enabled: formData.get("openai_enabled") === "on",
    openai_model: String(formData.get("openai_model") ?? "").trim() || "gpt-4o-mini",
  };

  const { error } = await saveAiConfig(config, session.id);
  if (error) console.warn("[admin.ai.update] db error", error);

  revalidatePath("/admin/ai");
  revalidatePath("/dashboard/ai-analysis");
}
