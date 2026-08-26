/**
 * OpenAI provider — same AiProvider interface as Gemini. Disabled by
 * default (AI_ENABLE_OPENAI / admin config) per the spec: prepare the
 * integration, don't turn it on. Plain REST fetch, no SDK dependency.
 */

import type { AiProvider, AiAnalysisResult, AiChatResult, AiChatTurn } from "./types";
import { AiProviderError } from "./types";

const TIMEOUT_MS = 45_000; // kept symmetric with gemini-provider.ts's timeout
const MAX_OUTPUT_TOKENS = 1100;
const ENDPOINT = "https://api.openai.com/v1/chat/completions";

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

async function callOpenAi(
  model: string,
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
  jsonSchema: unknown
): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AiProviderError("OpenAI API key not configured", "unavailable");

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
  } catch {
    throw new AiProviderError("OpenAI request failed", "unavailable");
  }

  if (!res.ok) {
    console.warn("[ai.openai] non-200 response", res.status);
    throw new AiProviderError("OpenAI provider error", "provider_error");
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new AiProviderError("OpenAI returned no content", "invalid_response");

  try {
    return JSON.parse(text);
  } catch {
    throw new AiProviderError("OpenAI returned invalid JSON", "invalid_response");
  }
}

export class OpenAiProvider implements AiProvider {
  readonly id = "openai" as const;
  constructor(private model: string) {}

  async analyze(systemPrompt: string, userPrompt: string): Promise<AiAnalysisResult> {
    const parsed = await callOpenAi(this.model, systemPrompt, [{ role: "user", content: userPrompt }], ANALYSIS_JSON_SCHEMA);
    return parsed as AiAnalysisResult;
  }

  async chat(systemPrompt: string, history: AiChatTurn[], question: string): Promise<AiChatResult> {
    const messages = [...history.map((h) => ({ role: h.role, content: h.content })), { role: "user" as const, content: question }];
    const parsed = await callOpenAi(this.model, systemPrompt, messages, CHAT_JSON_SCHEMA);
    return parsed as AiChatResult;
  }
}
