/**
 * ZAI provider — GLM-4.7 Flash via Cloudflare Workers AI, same AiProvider
 * interface as Gemini/OpenAI/Groq. Reference pipeline:
 * D:\FlutterProjects\auc\backend\src\cloudflare-ai.ts (a sibling project
 * that already runs GLM-4.7 Flash in production via env.AI.run()).
 *
 * That reference calls Workers AI through a Cloudflare Worker's own `env.AI`
 * binding — zero API key, authenticated purely by being deployed as that
 * Worker. SMF IoT's backend is Next.js on Vercel (no Worker, no binding),
 * so this instead calls Cloudflare's Workers AI REST API
 * (https://developers.cloudflare.com/api/resources/ai/) with a Cloudflare
 * API Token — same request/response shape as the binding, just reached
 * over plain HTTPS like every other provider in this folder.
 *
 * Two behaviors carried over from the reference pipeline because they're
 * true of the model, not the transport:
 * - `chat_template_kwargs.enable_thinking: false` — GLM is a "thinking"
 *   model; without this it prepends chain-of-thought reasoning text ahead
 *   of the JSON, breaking a plain JSON.parse.
 * - No `response_format: json_schema` (unlike openai-provider.ts /
 *   groq-provider.ts) — Workers AI's GLM binding doesn't support
 *   OpenAI-style structured output, confirmed by the reference project's
 *   own implementation, which spells the JSON shape out in the prompt
 *   instead and parses the free-text reply.
 */

import type { AiProvider, AiAnalysisResult, AiChatResult, AiChatTurn } from "./types";
import { AiProviderError } from "./types";

const TIMEOUT_MS = 45_000; // kept symmetric with gemini/openai/groq providers' timeout
const MAX_OUTPUT_TOKENS = 2000;
export const ZAI_DEFAULT_MODEL = "@cf/zai-org/glm-4.7-flash";

const ANALYSIS_SCHEMA_HINT = `

Respond with ONLY a JSON object, no markdown code fences, matching exactly this shape:
{"summary":string,"status":"good"|"attention"|"critical","insights":string[],"anomalies":string[],"recommendations":string[],"metrics":[{"label":string,"value":string}],"crop_advisory":{"environment_notes":string[],"watch_items":string[],"pest_disease_notes":string[],"daily_actions":string[]}}`;

const CHAT_SCHEMA_HINT = `

Respond with ONLY a JSON object, no markdown code fences, matching exactly this shape:
{"answer":string,"supporting_data":string[]}`;

function endpointFor(accountId: string, model: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
}

/**
 * Workers AI text-generation models reply as `{ response: string }`, but
 * OpenAI-compatible chat models reply as `{ choices: [{ message: { content
 * } }] }` — GLM-4.7 Flash has been observed doing either depending on how
 * it's invoked, so both are handled (same guard as the reference
 * cloudflare-ai.ts's extractResponseText).
 */
function extractResponseText(result: unknown): string | null {
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

/** Some chat models wrap JSON in ```json ... ``` fences despite instructions not to. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

async function callZaiOnce(
  model: string,
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
  accountId: string,
  apiToken: string
): Promise<{ ok: true; data: unknown } | { ok: false; retryable: boolean; error: AiProviderError }> {
  let res: Response;
  try {
    res = await fetch(endpointFor(accountId, model), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiToken}` },
      body: JSON.stringify({
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        chat_template_kwargs: { enable_thinking: false },
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const isTimeout = e instanceof Error && e.name === "TimeoutError";
    return { ok: false, retryable: false, error: new AiProviderError(isTimeout ? "ZAI request timed out" : "ZAI request failed", isTimeout ? "timeout" : "unavailable") };
  }

  if (res.status === 429) {
    console.warn("[ai.zai] rate limited");
    return { ok: false, retryable: false, error: new AiProviderError("ZAI rate limit reached", "provider_error") };
  }
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    console.warn("[ai.zai] non-200 response", res.status, bodyText.slice(0, 500));
    return { ok: false, retryable: false, error: new AiProviderError("ZAI provider error", "provider_error") };
  }

  // Cloudflare's REST API wraps the Workers AI result in the standard v4
  // envelope { success, result, errors } — the env.AI.run() binding call
  // in the reference project skips this wrapper since it returns the
  // inner `result` value directly.
  const envelope = await res.json();
  if (envelope?.success !== true) {
    console.warn("[ai.zai] envelope reported failure", JSON.stringify(envelope?.errors ?? []).slice(0, 300));
    return { ok: false, retryable: false, error: new AiProviderError("ZAI provider error", "provider_error") };
  }

  const rawText = extractResponseText(envelope.result);
  if (rawText === null) {
    console.warn("[ai.zai] response had no text", JSON.stringify(envelope.result).slice(0, 300));
    return { ok: false, retryable: true, error: new AiProviderError("ZAI returned no content", "invalid_response") };
  }

  try {
    return { ok: true, data: JSON.parse(stripCodeFence(rawText)) };
  } catch {
    // No server-side json_schema validation for this provider (see file
    // doc comment) - an occasional malformed reply is expected; one retry
    // usually succeeds, same idiom as groq-provider.ts's
    // retry-on-json_validate_failed.
    return { ok: false, retryable: true, error: new AiProviderError("ZAI returned invalid JSON", "invalid_response") };
  }
}

async function callZai(
  model: string,
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[]
): Promise<unknown> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) throw new AiProviderError("ZAI (Cloudflare Workers AI) not configured", "unavailable");

  const first = await callZaiOnce(model, systemPrompt, messages, accountId, apiToken);
  if (first.ok) return first.data;
  if (!first.retryable) throw first.error;

  console.warn("[ai.zai] retrying once after invalid response");
  const second = await callZaiOnce(model, systemPrompt, messages, accountId, apiToken);
  if (second.ok) return second.data;
  throw second.error;
}

export class ZaiProvider implements AiProvider {
  readonly id = "zai" as const;
  constructor(private model: string = ZAI_DEFAULT_MODEL) {}

  async analyze(systemPrompt: string, userPrompt: string): Promise<AiAnalysisResult> {
    const parsed = await callZai(this.model, systemPrompt + ANALYSIS_SCHEMA_HINT, [{ role: "user", content: userPrompt }]);
    return parsed as AiAnalysisResult;
  }

  async chat(systemPrompt: string, history: AiChatTurn[], question: string): Promise<AiChatResult> {
    const messages = [...history.map((h) => ({ role: h.role, content: h.content })), { role: "user" as const, content: question }];
    const parsed = await callZai(this.model, systemPrompt + CHAT_SCHEMA_HINT, messages);
    return parsed as AiChatResult;
  }
}
