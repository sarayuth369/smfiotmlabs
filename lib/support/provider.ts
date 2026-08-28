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

const RELEVANCE_JSON_SCHEMA = {
  name: "kb_relevance",
  schema: {
    type: "object",
    properties: { relevant_ids: { type: "array", items: { type: "string" } } },
    required: ["relevant_ids"],
    additionalProperties: false,
  },
  strict: true,
};

type ChatMsg = { role: "system" | "user" | "assistant"; content: string };
type JsonSchema = { name: string; schema: Record<string, unknown>; strict: boolean };

async function callChatCompletions(
  endpoint: string,
  apiKey: string,
  model: string,
  messages: ChatMsg[],
  maxTokens: number,
  schema: JsonSchema,
  temperature: number
): Promise<{ ok: true; text: string } | { ok: false; error: string; retryable: boolean }> {
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: "json_schema", json_schema: schema },
        max_tokens: maxTokens,
        temperature,
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

async function callJsonWithRetry(
  endpoint: string,
  apiKey: string,
  model: string,
  messages: ChatMsg[],
  maxTokens: number,
  schema: JsonSchema,
  temperature: number
): Promise<{ ok: true; parsed: unknown } | { ok: false; error: string }> {
  let result = await callChatCompletions(endpoint, apiKey, model, messages, maxTokens, schema, temperature);
  if (!result.ok && result.retryable) {
    result = await callChatCompletions(endpoint, apiKey, model, messages, maxTokens, schema, temperature);
  }
  if (!result.ok) return { ok: false, error: result.error };

  try {
    return { ok: true, parsed: JSON.parse(result.text) };
  } catch {
    return { ok: false, error: "invalid JSON from provider" };
  }
}

async function callSupport(endpoint: string, apiKeyEnv: string, model: string, messages: ChatMsg[], maxTokens: number): Promise<SupportChatResult> {
  const apiKey = process.env[apiKeyEnv];
  if (!apiKey) return { ok: false, error: `${apiKeyEnv} not configured` };

  const result = await callJsonWithRetry(endpoint, apiKey, model, messages, maxTokens, SUPPORT_JSON_SCHEMA, 0.2);
  if (!result.ok) return { ok: false, error: result.error };

  const parsed = result.parsed as Record<string, unknown>;
  if (typeof parsed.reply !== "string") return { ok: false, error: "invalid response shape" };
  return {
    ok: true,
    reply: parsed.reply,
    suggestEscalation: !!parsed.suggest_escalation,
    escalationReason: typeof parsed.escalation_reason === "string" ? parsed.escalation_reason : "",
  };
}

export async function callGroqSupport(model: string, messages: ChatMsg[], maxTokens: number): Promise<SupportChatResult> {
  return callSupport(GROQ_ENDPOINT, "GROQ_API_KEY", model, messages, maxTokens);
}

export async function callOpenAiSupport(model: string, messages: ChatMsg[], maxTokens: number): Promise<SupportChatResult> {
  return callSupport(OPENAI_ENDPOINT, "OPENAI_API_KEY", model, messages, maxTokens);
}

/**
 * Lets the AI itself judge which knowledge-base articles are relevant to
 * the customer's message — semantic, not string matching, so a customer
 * typing a spelling variant, a paraphrase, or an indirect way of asking
 * still finds the right article. Only {id, title, category} for every
 * published entry goes into this call, never full article content, so
 * it stays cheap even as the knowledge base grows — full content for
 * just the selected ids is fetched separately, only for entries actually
 * used. Falls back to an empty selection (never throws) so a provider
 * hiccup here degrades to "no knowledge found" rather than breaking the
 * whole chat turn.
 */
export type RelevanceResult = { ok: true; ids: string[] } | { ok: false };

async function selectRelevant(endpoint: string, apiKeyEnv: string, model: string, userMessage: string, candidates: { id: string; title: string; category: string }[]): Promise<RelevanceResult> {
  const apiKey = process.env[apiKeyEnv];
  if (!apiKey) return { ok: false };
  if (candidates.length === 0) return { ok: true, ids: [] };

  const list = candidates.map((c) => `${c.id} | [${c.category}] ${c.title}`).join("\n");
  const messages: ChatMsg[] = [
    {
      role: "system",
      content:
        "คุณช่วยเลือกว่าบทความความรู้ข้อไหนเกี่ยวข้องกับคำถามของลูกค้า ให้พิจารณาความหมายจริง ไม่ใช่แค่คำที่ตรงกันตัวต่อตัว " +
        "(ลูกค้าอาจสะกดต่างไปหรือถามอ้อมๆ แต่ความหมายตรงกับหัวข้อได้) ตอบเฉพาะ id ของบทความที่เกี่ยวข้องจริงๆ เท่านั้น ถ้าไม่มีข้อไหนเกี่ยวข้องให้ตอบ array ว่าง",
    },
    { role: "user", content: `รายการบทความ (id | หมวดหมู่ หัวข้อ):\n${list}\n\nคำถามลูกค้า: ${userMessage}` },
  ];

  const result = await callJsonWithRetry(endpoint, apiKey, model, messages, 300, RELEVANCE_JSON_SCHEMA, 0);
  if (!result.ok) {
    console.warn("[support.ai] relevance selection failed", result.error);
    return { ok: false };
  }
  const ids = (result.parsed as Record<string, unknown>).relevant_ids;
  if (!Array.isArray(ids)) return { ok: false };
  const validIds = new Set(candidates.map((c) => c.id));
  return { ok: true, ids: ids.filter((id): id is string => typeof id === "string" && validIds.has(id)) };
}

export async function selectRelevantGroq(model: string, userMessage: string, candidates: { id: string; title: string; category: string }[]): Promise<RelevanceResult> {
  return selectRelevant(GROQ_ENDPOINT, "GROQ_API_KEY", model, userMessage, candidates);
}

export async function selectRelevantOpenAi(model: string, userMessage: string, candidates: { id: string; title: string; category: string }[]): Promise<RelevanceResult> {
  return selectRelevant(OPENAI_ENDPOINT, "OPENAI_API_KEY", model, userMessage, candidates);
}
