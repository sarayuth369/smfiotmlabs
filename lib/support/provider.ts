/**
 * Support Chat AI calls — Groq and OpenAI only (no Gemini), completely
 * separate from lib/ai/* (Farm AI Analysis). Deliberately NOT built on
 * top of lib/ai/types.ts's AiProvider interface: that interface's
 * analyze()/chat() methods are locked to the farm_analysis/farm_chat_answer
 * JSON schemas, which don't fit a conversational support reply + an
 * escalation signal. The low-level HTTP/error-handling shape mirrors
 * lib/ai/openai-provider.ts and lib/ai/groq-provider.ts on purpose (same
 * proven timeout/retry idioms) without importing from those files, so
 * this can't accidentally couple to or destabilize Farm AI Analysis.
 */

const TIMEOUT_MS = 30_000;
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

export type SupportChatResult =
  | { ok: true; reply: string; suggestEscalation: boolean; escalationReason: string }
  | { ok: false; error: string };

const SUPPORT_JSON_SCHEMA = {
  name: "support_reply",
  schema: {
    type: "object",
    properties: {
      reply: { type: "string" },
      suggest_escalation: { type: "boolean" },
      escalation_reason: { type: "string" },
    },
    required: ["reply", "suggest_escalation", "escalation_reason"],
    additionalProperties: false,
  },
  strict: true,
};

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

async function callChatCompletions(
  endpoint: string,
  apiKey: string,
  model: string,
  messages: ChatMsg[],
  maxTokens: number
): Promise<{ ok: true; text: string } | { ok: false; error: string; retryable: boolean }> {
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: "json_schema", json_schema: SUPPORT_JSON_SCHEMA },
        max_tokens: maxTokens,
        temperature: 0.4,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const isTimeout = e instanceof Error && e.name === "TimeoutError";
    return { ok: false, error: isTimeout ? "request timed out" : "request failed", retryable: false };
  }

  if (res.status === 429) {
    console.warn("[support.ai] rate limited", endpoint);
    return { ok: false, error: "rate limited", retryable: false };
  }
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    console.warn("[support.ai] non-200 response", endpoint, res.status, bodyText.slice(0, 500));
    // same Groq structured-output quirk fixed for Farm AI (Phase 6.16b) —
    // a reasoning model occasionally misses a required field on the first try.
    const retryable = res.status === 400 && bodyText.includes("json_validate_failed");
    return { ok: false, error: "provider error", retryable };
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") return { ok: false, error: "no content returned", retryable: false };
  return { ok: true, text };
}

async function callWithRetry(endpoint: string, apiKey: string, model: string, messages: ChatMsg[], maxTokens: number): Promise<SupportChatResult> {
  let result = await callChatCompletions(endpoint, apiKey, model, messages, maxTokens);
  if (!result.ok && result.retryable) {
    result = await callChatCompletions(endpoint, apiKey, model, messages, maxTokens);
  }
  if (!result.ok) return { ok: false, error: result.error };

  try {
    const parsed = JSON.parse(result.text);
    if (typeof parsed.reply !== "string") return { ok: false, error: "invalid response shape" };
    return {
      ok: true,
      reply: parsed.reply,
      suggestEscalation: !!parsed.suggest_escalation,
      escalationReason: typeof parsed.escalation_reason === "string" ? parsed.escalation_reason : "",
    };
  } catch {
    return { ok: false, error: "invalid JSON from provider" };
  }
}

export async function callGroqSupport(model: string, messages: ChatMsg[], maxTokens: number): Promise<SupportChatResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { ok: false, error: "Groq API key not configured" };
  return callWithRetry(GROQ_ENDPOINT, apiKey, model, messages, maxTokens);
}

export async function callOpenAiSupport(model: string, messages: ChatMsg[], maxTokens: number): Promise<SupportChatResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OpenAI API key not configured" };
  return callWithRetry(OPENAI_ENDPOINT, apiKey, model, messages, maxTokens);
}
