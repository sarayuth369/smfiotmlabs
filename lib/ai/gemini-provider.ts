/**
 * Gemini provider — plain REST fetch (no SDK dependency added). Uses
 * responseMimeType: "application/json" + responseSchema so the model
 * itself returns the exact shape we need — no markdown/regex parsing.
 * Single attempt, no retry loop, bounded output tokens (cost control).
 */

import type { AiProvider, AiAnalysisResult, AiChatResult, AiChatTurn } from "./types";
import { AiProviderError } from "./types";

// Free-tier Gemini requests occasionally run well past 20s (rate-limit
// queuing, cold inference) — confirmed live via a TimeoutError on a chat
// call ~1 request after a successful analyze call. Route handlers set
// maxDuration to give Vercel's own platform timeout enough headroom above this.
const TIMEOUT_MS = 28_000;
const MAX_OUTPUT_TOKENS = 800;

const ANALYSIS_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    status: { type: "STRING", enum: ["good", "attention", "critical"] },
    insights: { type: "ARRAY", items: { type: "STRING" } },
    anomalies: { type: "ARRAY", items: { type: "STRING" } },
    recommendations: { type: "ARRAY", items: { type: "STRING" } },
    metrics: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { label: { type: "STRING" }, value: { type: "STRING" } },
        required: ["label", "value"],
      },
    },
  },
  required: ["summary", "status", "insights", "anomalies", "recommendations", "metrics"],
};

const CHAT_SCHEMA = {
  type: "OBJECT",
  properties: {
    answer: { type: "STRING" },
    supporting_data: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["answer", "supporting_data"],
};

function endpoint(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

async function callGemini(
  model: string,
  systemPrompt: string,
  contents: { role: "user" | "model"; parts: { text: string }[] }[],
  schema: unknown
): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new AiProviderError("Gemini API key not configured", "unavailable");

  let res: Response;
  try {
    res = await fetch(`${endpoint(model)}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: 0.3,
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    // Log the exception itself (never the key — it's only ever in the
    // request URL, never in this error object) — otherwise a runtime-level
    // failure (e.g. AbortSignal.timeout unsupported, DNS, TLS) is
    // indistinguishable from "no key configured" and impossible to debug.
    console.warn("[ai.gemini] fetch threw", e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    throw new AiProviderError("Gemini request failed", "unavailable");
  }

  if (!res.ok) {
    // Body is Google's own error description (e.g. "model not found",
    // "API key not valid") — never anything we sent, so safe to log.
    const bodyText = await res.text().catch(() => "");
    console.warn("[ai.gemini] non-200 response", res.status, bodyText.slice(0, 500));
    throw new AiProviderError("Gemini provider error", "provider_error");
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch (e) {
    console.warn("[ai.gemini] response body was not JSON", e instanceof Error ? e.message : String(e));
    throw new AiProviderError("Gemini returned invalid response", "invalid_response");
  }

  const text = (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    console.warn("[ai.gemini] no text in response", JSON.stringify(data).slice(0, 500));
    throw new AiProviderError("Gemini returned no content", "invalid_response");
  }

  try {
    return JSON.parse(text);
  } catch {
    console.warn("[ai.gemini] candidate text was not valid JSON", text.slice(0, 300));
    throw new AiProviderError("Gemini returned invalid JSON", "invalid_response");
  }
}

export class GeminiProvider implements AiProvider {
  readonly id = "gemini" as const;
  constructor(private model: string) {}

  async analyze(systemPrompt: string, userPrompt: string): Promise<AiAnalysisResult> {
    const parsed = await callGemini(this.model, systemPrompt, [{ role: "user", parts: [{ text: userPrompt }] }], ANALYSIS_SCHEMA);
    return parsed as AiAnalysisResult;
  }

  async chat(systemPrompt: string, history: AiChatTurn[], question: string): Promise<AiChatResult> {
    const contents = [
      ...history.map((h) => ({ role: (h.role === "assistant" ? "model" : "user") as "user" | "model", parts: [{ text: h.content }] })),
      { role: "user" as const, parts: [{ text: question }] },
    ];
    const parsed = await callGemini(this.model, systemPrompt, contents, CHAT_SCHEMA);
    return parsed as AiChatResult;
  }
}
