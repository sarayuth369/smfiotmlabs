/**
 * Groq provider — same AiProvider interface as Gemini/OpenAI. Groq's API
 * is OpenAI-compatible (chat/completions + json_schema structured output),
 * so this mirrors openai-provider.ts almost exactly, just a different
 * endpoint/key. Disabled by default, same as OpenAI — prepare the
 * integration, don't turn it on until the admin picks it.
 */

import type { AiProvider, AiAnalysisResult, AiChatResult, AiChatTurn } from "./types";
import { AiProviderError } from "./types";

const TIMEOUT_MS = 45_000; // kept symmetric with gemini/openai providers' timeout
const MAX_OUTPUT_TOKENS = 1100;
const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

const ANALYSIS_JSON_SCHEMA = {
  name: "farm_analysis",
  schema: {
    type: "object",
    properties: {
      summary: { type: "string" },
      status: { type: "string", enum: ["good", "attention", "critical"] },
      insights: { type: "array", items: { type: "string" } },
      anomalies: { type: "array", items: { type: "string" } },
      recommendations: { type: "array", items: { type: "string" } },
      metrics: {
        type: "array",
        items: {
          type: "object",
          properties: { label: { type: "string" }, value: { type: "string" } },
          required: ["label", "value"],
          additionalProperties: false,
        },
      },
      crop_advisory: {
        type: "object",
        properties: {
          environment_notes: { type: "array", items: { type: "string" } },
          watch_items: { type: "array", items: { type: "string" } },
          pest_disease_notes: { type: "array", items: { type: "string" } },
          daily_actions: { type: "array", items: { type: "string" } },
        },
        required: ["environment_notes", "watch_items", "pest_disease_notes", "daily_actions"],
        additionalProperties: false,
      },
    },
    required: ["summary", "status", "insights", "anomalies", "recommendations", "metrics", "crop_advisory"],
    additionalProperties: false,
  },
  strict: true,
};

const CHAT_JSON_SCHEMA = {
  name: "farm_chat_answer",
  schema: {
    type: "object",
    properties: { answer: { type: "string" }, supporting_data: { type: "array", items: { type: "string" } } },
    required: ["answer", "supporting_data"],
    additionalProperties: false,
  },
  strict: true,
};

async function callGroqOnce(
  model: string,
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
  jsonSchema: unknown,
  apiKey: string
): Promise<{ ok: true; data: unknown } | { ok: false; retryable: boolean; error: AiProviderError }> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        response_format: { type: "json_schema", json_schema: jsonSchema },
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const isTimeout = e instanceof Error && e.name === "TimeoutError";
    return { ok: false, retryable: false, error: new AiProviderError(isTimeout ? "Groq request timed out" : "Groq request failed", isTimeout ? "timeout" : "unavailable") };
  }

  if (res.status === 429) {
    console.warn("[ai.groq] rate limited");
    return { ok: false, retryable: false, error: new AiProviderError("Groq rate limit reached", "provider_error") };
  }
  if (!res.ok) {
    // Body is Groq's own error description, never our request/key — safe to log.
    const bodyText = await res.text().catch(() => "");
    console.warn("[ai.groq] non-200 response", res.status, bodyText.slice(0, 500));
    // json_validate_failed: the model's own generation missed a required schema
    // field (Groq validates server-side before returning) — a known, mostly
    // non-deterministic structured-output miss on complex/nested schemas.
    // Groq's own guidance is to retry; a second generation usually succeeds.
    const retryable = res.status === 400 && bodyText.includes("json_validate_failed");
    return { ok: false, retryable, error: new AiProviderError("Groq provider error", "provider_error") };
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") return { ok: false, retryable: false, error: new AiProviderError("Groq returned no content", "invalid_response") };

  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, retryable: false, error: new AiProviderError("Groq returned invalid JSON", "invalid_response") };
  }
}

async function callGroq(
  model: string,
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
  jsonSchema: unknown
): Promise<unknown> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new AiProviderError("Groq API key not configured", "unavailable");

  const first = await callGroqOnce(model, systemPrompt, messages, jsonSchema, apiKey);
  if (first.ok) return first.data;
  if (!first.retryable) throw first.error;

  console.warn("[ai.groq] retrying once after json_validate_failed");
  const second = await callGroqOnce(model, systemPrompt, messages, jsonSchema, apiKey);
  if (second.ok) return second.data;
  throw second.error;
}

export class GroqProvider implements AiProvider {
  readonly id = "groq" as const;
  constructor(private model: string) {}

  async analyze(systemPrompt: string, userPrompt: string): Promise<AiAnalysisResult> {
    const parsed = await callGroq(this.model, systemPrompt, [{ role: "user", content: userPrompt }], ANALYSIS_JSON_SCHEMA);
    return parsed as AiAnalysisResult;
  }

  async chat(systemPrompt: string, history: AiChatTurn[], question: string): Promise<AiChatResult> {
    const messages = [...history.map((h) => ({ role: h.role, content: h.content })), { role: "user" as const, content: question }];
    const parsed = await callGroq(this.model, systemPrompt, messages, CHAT_JSON_SCHEMA);
    return parsed as AiChatResult;
  }
}
