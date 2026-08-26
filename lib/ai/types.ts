export type FarmStatus = "good" | "attention" | "critical";

export type AiAnalysisResult = {
  summary: string;
  status: FarmStatus;
  insights: string[];
  anomalies: string[];
  recommendations: string[];
  metrics: { label: string; value: string }[];
};

export type AiChatResult = {
  answer: string;
  supporting_data: string[];
};

export type AiChatTurn = { role: "user" | "assistant"; content: string };

export interface AiProvider {
  readonly id: "gemini" | "openai";
  analyze(systemPrompt: string, userPrompt: string): Promise<AiAnalysisResult>;
  chat(systemPrompt: string, history: AiChatTurn[], question: string): Promise<AiChatResult>;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly code: "unavailable" | "provider_error" | "invalid_response" | "timeout"
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}
