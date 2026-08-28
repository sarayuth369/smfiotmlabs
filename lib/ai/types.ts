export type FarmStatus = "good" | "attention" | "critical";

/** Only generated when a real crop is set on the zone — see lib/ai/context.ts. All AI-authored text, never raw numbers (those come straight from DB/weather, not the model). */
export type CropAdvisory = {
  environment_notes: string[]; // 🌡 สภาพแวดล้อม — how temp/humidity/soil/light/weather suit this crop right now
  watch_items: string[]; // ⚠️ สิ่งที่ควรระวัง
  pest_disease_notes: string[]; // 🐛 hedged — general/seasonal risk, never a claimed real outbreak
  daily_actions: string[]; // 📋 3-5 items, most important first
};

export type AiAnalysisResult = {
  summary: string;
  status: FarmStatus;
  insights: string[];
  anomalies: string[];
  recommendations: string[];
  metrics: { label: string; value: string }[];
  crop_advisory: CropAdvisory;
};

export type AiChatResult = {
  answer: string;
  supporting_data: string[];
};

export type AiChatTurn = { role: "user" | "assistant"; content: string };

export interface AiProvider {
  readonly id: "gemini" | "openai" | "groq";
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
