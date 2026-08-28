/**
 * Phase 6.17 — Support Chat admin configuration. Same system_settings
 * key/value/upsert pattern as lib/admin/ai-settings.ts ("ai") and
 * lib/admin/settings.ts ("line") — deliberately separate keys/rows so
 * this never shares config with the Farm AI Analysis feature. API keys
 * are never stored here — only GROQ_API_KEY / OPENAI_API_KEY from env,
 * checked via hasSupportProviderKey().
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { LineSettings } from "@/lib/admin/settings";

export type SupportProviderId = "groq" | "openai";

export type SupportAiConfig = {
  enabled: boolean;
  provider: SupportProviderId;
  groq_model: string;
  openai_model: string;
  assistant_name: string;
  welcome_message: string;
  tone: string;
  max_response_length: number; // rough character budget for replies
  escalation_after_turns: number; // nudge toward Human Handoff after this many unresolved exchanges
};

const DEFAULT_SUPPORT_AI: SupportAiConfig = {
  enabled: false,
  provider: "groq",
  groq_model: process.env.SUPPORT_GROQ_MODEL || "openai/gpt-oss-120b",
  openai_model: process.env.SUPPORT_OPENAI_MODEL || "gpt-4o-mini",
  assistant_name: "น้องเอส",
  welcome_message: "สวัสดีค่ะ 😊 มีอะไรให้ SMF IoT Support ช่วยไหมคะ?",
  tone: "สุภาพ เป็นกันเอง กระชับ ไม่พูดยาวเกินจำเป็น เหมาะกับลูกค้าเกษตรกร",
  max_response_length: 600,
  escalation_after_turns: 4,
};

const SUPPORT_PROVIDER_IDS: SupportProviderId[] = ["groq", "openai"];

export async function getSupportAiConfig(): Promise<SupportAiConfig> {
  const admin = createAdminClient();
  const { data } = await admin.from("system_settings").select("value").eq("key", "support_ai").maybeSingle();
  const v = (data?.value ?? {}) as Partial<SupportAiConfig>;
  return {
    enabled: v.enabled ?? DEFAULT_SUPPORT_AI.enabled,
    provider: SUPPORT_PROVIDER_IDS.includes(v.provider as SupportProviderId) ? (v.provider as SupportProviderId) : DEFAULT_SUPPORT_AI.provider,
    groq_model: v.groq_model || DEFAULT_SUPPORT_AI.groq_model,
    openai_model: v.openai_model || DEFAULT_SUPPORT_AI.openai_model,
    assistant_name: v.assistant_name || DEFAULT_SUPPORT_AI.assistant_name,
    welcome_message: v.welcome_message || DEFAULT_SUPPORT_AI.welcome_message,
    tone: v.tone || DEFAULT_SUPPORT_AI.tone,
    max_response_length: v.max_response_length && v.max_response_length > 0 ? v.max_response_length : DEFAULT_SUPPORT_AI.max_response_length,
    escalation_after_turns: v.escalation_after_turns && v.escalation_after_turns > 0 ? v.escalation_after_turns : DEFAULT_SUPPORT_AI.escalation_after_turns,
  };
}

export async function saveSupportAiConfig(next: SupportAiConfig, updatedBy?: string) {
  const admin = createAdminClient();
  return admin.from("system_settings").upsert(
    { key: "support_ai", value: next, updated_at: new Date().toISOString(), updated_by: updatedBy ?? null },
    { onConflict: "key" }
  );
}

/** Whether the active support provider has its API key present in env — never returns the key itself. */
export function hasSupportProviderKey(provider: SupportProviderId): boolean {
  if (provider === "groq") return !!process.env.GROQ_API_KEY;
  return !!process.env.OPENAI_API_KEY;
}

export async function isSupportChatReady(): Promise<boolean> {
  const cfg = await getSupportAiConfig();
  return cfg.enabled && hasSupportProviderKey(cfg.provider);
}

const DEFAULT_SUPPORT_LINE: LineSettings = {
  channel_access_token: "",
  mode: "user",
  target_id: "",
  enabled: false,
};

/** Separate destination from the customer-facing "line" broadcast config
 * (lib/admin/settings.ts) — this is where a Human Handoff summary goes,
 * typically the internal BKKNEX support team's OA/group, not customers. */
export async function getSupportLineSettings(): Promise<LineSettings> {
  const admin = createAdminClient();
  const { data } = await admin.from("system_settings").select("value").eq("key", "support_line").maybeSingle();
  const v = (data?.value ?? {}) as Partial<LineSettings>;
  const mode = v.mode === "group" || v.mode === "user" || v.mode === "broadcast" ? v.mode : DEFAULT_SUPPORT_LINE.mode;
  return {
    channel_access_token: v.channel_access_token ?? DEFAULT_SUPPORT_LINE.channel_access_token,
    mode,
    target_id: v.target_id ?? DEFAULT_SUPPORT_LINE.target_id,
    enabled: v.enabled ?? DEFAULT_SUPPORT_LINE.enabled,
  };
}

export function isSupportLineReady(line: LineSettings): boolean {
  if (!line.enabled || !line.channel_access_token) return false;
  if (line.mode === "broadcast") return true;
  return !!line.target_id;
}

export async function saveSupportLineSettings(next: LineSettings, updatedBy?: string) {
  const admin = createAdminClient();
  return admin.from("system_settings").upsert(
    { key: "support_line", value: next, updated_at: new Date().toISOString(), updated_by: updatedBy ?? null },
    { onConflict: "key" }
  );
}
