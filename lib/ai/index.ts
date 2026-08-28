/**
 * AIService — single entry point the rest of the app calls. Nothing
 * outside lib/ai/* ever talks to Gemini/OpenAI directly.
 *
 * No automatic fallback between providers by design (spec 6.14 §3) — if
 * the admin's chosen default provider is disabled or missing its key,
 * this throws "unavailable" rather than silently trying another
 * provider and racking up unexpected cost on a key nobody meant to use.
 */

import { getAiConfig, hasProviderKey, type AiProviderId } from "@/lib/admin/ai-settings";
import { GeminiProvider } from "./gemini-provider";
import { OpenAiProvider } from "./openai-provider";
import { GroqProvider } from "./groq-provider";
import { AiProviderError, type AiProvider, type AiAnalysisResult, type AiChatResult, type AiChatTurn } from "./types";

export { AiProviderError };
export type { AiAnalysisResult, AiChatResult, AiChatTurn };

async function resolveActiveProvider(): Promise<{ provider: AiProvider; providerId: AiProviderId; model: string }> {
  const cfg = await getAiConfig();
  const id = cfg.default_provider;

  if (id === "gemini") {
    if (!cfg.gemini_enabled || !hasProviderKey("gemini")) {
      throw new AiProviderError("AI provider is currently unavailable", "unavailable");
    }
    return { provider: new GeminiProvider(cfg.gemini_model), providerId: "gemini", model: cfg.gemini_model };
  }

  if (id === "groq") {
    if (!cfg.groq_enabled || !hasProviderKey("groq")) {
      throw new AiProviderError("AI provider is currently unavailable", "unavailable");
    }
    return { provider: new GroqProvider(cfg.groq_model), providerId: "groq", model: cfg.groq_model };
  }

  if (!cfg.openai_enabled || !hasProviderKey("openai")) {
    throw new AiProviderError("AI provider is currently unavailable", "unavailable");
  }
  return { provider: new OpenAiProvider(cfg.openai_model), providerId: "openai", model: cfg.openai_model };
}

/** Maps any AI failure to a safe, user-facing message — never the raw provider error/key. */
export function friendlyAiError(e: unknown): string {
  if (e instanceof AiProviderError) {
    if (e.code === "unavailable") return "AI provider is currently unavailable.";
    if (e.code === "timeout") return "AI service is taking longer than usual — please try again in a moment.";
    if (e.code === "provider_error") return "AI service is temporarily unavailable.";
    return "AI service is temporarily unavailable.";
  }
  return "AI service is temporarily unavailable.";
}

export const AIService = {
  async analyze(systemPrompt: string, userPrompt: string): Promise<{ result: AiAnalysisResult; providerId: AiProviderId; model: string }> {
    const { provider, providerId, model } = await resolveActiveProvider();
    const result = await provider.analyze(systemPrompt, userPrompt);
    return { result, providerId, model };
  },

  async chat(
    systemPrompt: string,
    history: AiChatTurn[],
    question: string
  ): Promise<{ result: AiChatResult; providerId: AiProviderId; model: string }> {
    const { provider, providerId, model } = await resolveActiveProvider();
    const result = await provider.chat(systemPrompt, history, question);
    return { result, providerId, model };
  },
};
