/**
 * Phase 6.14 — AI Analysis admin config. Same reusable pattern as
 * lib/admin/settings.ts (system_settings key/value table) — ONLY
 * non-secret configuration lives here (enabled toggles, model names,
 * default provider). API keys are never stored in the database — they
 * only ever come from process.env, checked separately.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export type AiProviderId = "gemini" | "openai" | "groq";

export type AiConfig = {
  default_provider: AiProviderId;
  gemini_enabled: boolean;
  gemini_model: string;
  openai_enabled: boolean;
  openai_model: string;
  groq_enabled: boolean;
  groq_model: string;
};

// Seed defaults only — once the admin saves a config row in system_settings,
// that DB value wins from then on (see getAiConfig below). GEMINI_MODEL /
// OPENAI_MODEL / GROQ_MODEL env vars just set the starting point before
// anyone has touched Admin > AI Analysis yet.
const DEFAULT_AI_CONFIG: AiConfig = {
  default_provider: "gemini",
  gemini_enabled: true,
  // gemini-2.5-flash-lite was retired for new accounts (confirmed live,
  // Aug 2026 — Google's own 404 error names the replacement explicitly).
  gemini_model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
  openai_enabled: false,
  openai_model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  groq_enabled: false,
  // llama-3.3-70b-versatile: fast (Groq LPU inference), cost-efficient,
  // strong enough for structured sensor analysis + farm chat. Admin can
  // change this in Admin > AI Analysis without any code change.
  groq_model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
};

const PROVIDER_IDS: AiProviderId[] = ["gemini", "openai", "groq"];

export async function getAiConfig(): Promise<AiConfig> {
  const admin = createAdminClient();
  const { data } = await admin.from("system_settings").select("value").eq("key", "ai").maybeSingle();
  const v = (data?.value ?? {}) as Partial<AiConfig>;
  return {
    default_provider: PROVIDER_IDS.includes(v.default_provider as AiProviderId) ? (v.default_provider as AiProviderId) : DEFAULT_AI_CONFIG.default_provider,
    gemini_enabled: v.gemini_enabled ?? DEFAULT_AI_CONFIG.gemini_enabled,
    gemini_model: v.gemini_model || DEFAULT_AI_CONFIG.gemini_model,
    openai_enabled: v.openai_enabled ?? DEFAULT_AI_CONFIG.openai_enabled,
    openai_model: v.openai_model || DEFAULT_AI_CONFIG.openai_model,
    groq_enabled: v.groq_enabled ?? DEFAULT_AI_CONFIG.groq_enabled,
    groq_model: v.groq_model || DEFAULT_AI_CONFIG.groq_model,
  };
}

export async function saveAiConfig(next: AiConfig, updatedBy?: string) {
  const admin = createAdminClient();
  return admin.from("system_settings").upsert(
    { key: "ai", value: next, updated_at: new Date().toISOString(), updated_by: updatedBy ?? null },
    { onConflict: "key" }
  );
}

/** Whether the given provider has its API key present in env — never returns the key itself. */
export function hasProviderKey(provider: AiProviderId): boolean {
  if (provider === "gemini") return !!process.env.GEMINI_API_KEY;
  if (provider === "groq") return !!process.env.GROQ_API_KEY;
  return !!process.env.OPENAI_API_KEY;
}

export type ProviderStatus = { id: AiProviderId; enabled: boolean; configured: boolean; active: boolean; model: string };

export async function getProviderStatuses(config?: AiConfig): Promise<ProviderStatus[]> {
  const cfg = config ?? (await getAiConfig());
  return [
    {
      id: "gemini",
      enabled: cfg.gemini_enabled,
      configured: hasProviderKey("gemini"),
      active: cfg.default_provider === "gemini" && cfg.gemini_enabled && hasProviderKey("gemini"),
      model: cfg.gemini_model,
    },
    {
      id: "openai",
      enabled: cfg.openai_enabled,
      configured: hasProviderKey("openai"),
      active: cfg.default_provider === "openai" && cfg.openai_enabled && hasProviderKey("openai"),
      model: cfg.openai_model,
    },
    {
      id: "groq",
      enabled: cfg.groq_enabled,
      configured: hasProviderKey("groq"),
      active: cfg.default_provider === "groq" && cfg.groq_enabled && hasProviderKey("groq"),
      model: cfg.groq_model,
    },
  ];
}
