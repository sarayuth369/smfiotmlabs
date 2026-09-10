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
function zaiEndpoint(accountId: string, model: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
}

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

// GLM-4.7 Flash (Cloudflare Workers AI) doesn't support response_format:
// json_schema like Groq/OpenAI do, so the shape is spelled out as text in
// the system prompt instead, and the reply is parsed manually. See
// lib/ai/zai-provider.ts for the same pattern used by Farm AI Analysis —
// duplicated here on purpose (this file intentionally never imports from
// lib/ai/*, see file doc comment above).
const SUPPORT_SCHEMA_HINT =
  '\nRespond with ONLY a JSON object, no markdown code fences, matching exactly: ' +
  '{"reply":string,"suggest_escalation":boolean,"escalation_reason":string}';
const RELEVANCE_SCHEMA_HINT =
  '\nRespond with ONLY a JSON object, no markdown code fences, matching exactly: {"relevant_ids":string[]}';

function extractZaiResponseText(result: unknown): string | null {
  if (typeof result !== "object" || result === null) return null;
  const obj = result as Record<string, unknown>;
  if (typeof obj.response === "string") return obj.response;
  const choices = obj.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const message = (choices[0] as Record<string, unknown> | undefined)?.message;
    const content = (message as Record<string, unknown> | undefined)?.content;
    if (typeof content === "string") return content;
  }
  return null;
}

/**
 * GLM has no server-side schema enforcement (unlike Groq/OpenAI's
 * response_format:json_schema above), so despite the "ONLY a JSON object"
 * instruction it sometimes chats first ("แน่นอนค่ะ นี่คือคำตอบ:") before
 * the JSON — more often here than on Farm AI Analysis's plainer prompt,
 * since this file's system prompt is deliberately personality-heavy
 * (สุภาพ, เป็นกันเอง tone). Pull the JSON out from wherever it sits:
 * a fenced block anywhere in the text, else the outermost {...} span.
 */
function extractZaiJsonText(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1].trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

async function callZaiCompletions(
  model: string,
  messages: ChatMsg[],
  schemaHint: string,
  maxTokens: number
): Promise<{ ok: true; text: string } | { ok: false; error: string; retryable: boolean }> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) return { ok: false, error: "ZAI (Cloudflare Workers AI) not configured", retryable: false };

  // Confirmed in production logs: on turn 2+ of a conversation, GLM
  // answers in plain Thai prose with zero JSON, ignoring the system
  // prompt's format instruction entirely - a multi-turn instruction gets
  // drowned out by conversational momentum. Repeating the hint on the
  // trailing user turn (closest to generation) keeps it front-of-mind.
  const lastIdx = messages.length - 1;
  const withHint = messages.map((m, i) => {
    if (m.role === "system") return { ...m, content: m.content + schemaHint };
    if (i === lastIdx && m.role === "user") return { ...m, content: m.content + schemaHint };
    return m;
  });

  let res: Response;
  try {
    res = await fetch(zaiEndpoint(accountId, model), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiToken}` },
      body: JSON.stringify({
        messages: withHint,
        chat_template_kwargs: { enable_thinking: false },
        max_tokens: maxTokens,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const isTimeout = e instanceof Error && e.name === "TimeoutError";
    return { ok: false, error: isTimeout ? "request timed out" : "request failed", retryable: false };
  }

  if (res.status === 429) {
    console.warn("[support.ai] zai rate limited");
    return { ok: false, error: "rate limited", retryable: false };
  }
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    console.warn("[support.ai] zai non-200 response", res.status, bodyText.slice(0, 500));
    return { ok: false, error: "provider error", retryable: false };
  }

  const envelope = await res.json();
  if (envelope?.success !== true) {
    console.warn("[support.ai] zai envelope reported failure", JSON.stringify(envelope?.errors ?? []).slice(0, 300));
    return { ok: false, error: "provider error", retryable: false };
  }

  const text = extractZaiResponseText(envelope.result);
  // No server-side schema validation for this provider - unlike Groq's
  // json_validate_failed signal, treat "no text" as worth one retry too.
  if (text === null) return { ok: false, error: "no content returned", retryable: true };
  return { ok: true, text };
}

function tryParseZaiJson(text: string): { ok: true; parsed: unknown } | { ok: false } {
  try {
    return { ok: true, parsed: JSON.parse(extractZaiJsonText(text)) };
  } catch {
    return { ok: false };
  }
}

async function callZaiJsonWithRetry(
  model: string,
  messages: ChatMsg[],
  schemaHint: string,
  maxTokens: number
): Promise<{ ok: true; parsed: unknown } | { ok: false; error: string; lastText?: string }> {
  let result = await callZaiCompletions(model, messages, schemaHint, maxTokens);
  if (!result.ok && result.retryable) {
    result = await callZaiCompletions(model, messages, schemaHint, maxTokens);
  }
  if (!result.ok) return { ok: false, error: result.error };

  let parsed = tryParseZaiJson(result.text);
  if (!parsed.ok) {
    // Fetch succeeded but the reply wasn't clean JSON (chatty preamble,
    // truncation, or - confirmed in production logs - GLM answering in
    // plain prose with zero JSON on turn 2+ of a conversation) - worth
    // exactly one more try, same idiom as the fetch-level retry above and
    // as lib/ai/zai-provider.ts's retry.
    console.warn("[support.ai] zai invalid JSON, retrying once:", result.text.slice(0, 300));
    const retry = await callZaiCompletions(model, messages, schemaHint, maxTokens);
    if (!retry.ok) return { ok: false, error: retry.error, lastText: result.text };
    parsed = tryParseZaiJson(retry.text);
    if (!parsed.ok) {
      console.warn("[support.ai] zai invalid JSON after retry:", retry.text.slice(0, 300));
      return { ok: false, error: "invalid JSON from provider", lastText: retry.text };
    }
  }
  return parsed;
}

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

export async function callZaiSupport(model: string, messages: ChatMsg[], maxTokens: number): Promise<SupportChatResult> {
  const result = await callZaiJsonWithRetry(model, messages, SUPPORT_SCHEMA_HINT, maxTokens);
  if (!result.ok) {
    // GLM sometimes ignores the JSON format instruction entirely on
    // later conversation turns and just answers in plain prose (see
    // callZaiJsonWithRetry's comment) - that prose is still a real,
    // safe, on-topic customer-facing answer, so use it directly rather
    // than surfacing "AI service is temporarily unavailable" for a
    // reply that actually succeeded. Only escalation detection is lost
    // for this one turn (suggestEscalation defaults false).
    if (result.lastText && result.lastText.trim()) {
      return { ok: true, reply: result.lastText.trim(), suggestEscalation: false, escalationReason: "" };
    }
    return { ok: false, error: result.error };
  }

  const parsed = result.parsed as Record<string, unknown>;
  if (typeof parsed.reply !== "string") return { ok: false, error: "invalid response shape" };
  return {
    ok: true,
    reply: parsed.reply,
    suggestEscalation: !!parsed.suggest_escalation,
    escalationReason: typeof parsed.escalation_reason === "string" ? parsed.escalation_reason : "",
  };
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

export async function selectRelevantZai(model: string, userMessage: string, candidates: { id: string; title: string; category: string }[]): Promise<RelevanceResult> {
  if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) return { ok: false };
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

  const result = await callZaiJsonWithRetry(model, messages, RELEVANCE_SCHEMA_HINT, 300);
  if (!result.ok) {
    console.warn("[support.ai] zai relevance selection failed", result.error);
    return { ok: false };
  }
  const ids = (result.parsed as Record<string, unknown>).relevant_ids;
  if (!Array.isArray(ids)) return { ok: false };
  const validIds = new Set(candidates.map((c) => c.id));
  return { ok: true, ids: ids.filter((id): id is string => typeof id === "string" && validIds.has(id)) };
}
