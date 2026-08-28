/**
 * Support Knowledge Base — admin CRUD + retrieval for the chat.
 *
 * Retrieval is deliberately simple keyword matching (Postgres full-text
 * via websearch_to_tsquery), not a vector DB — this scope doesn't need
 * one yet, and it keeps every chat turn cheap: only the few relevant
 * entries found are sent to the AI, never the whole table.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export type KnowledgeStatus = "published" | "draft";

export type KnowledgeEntry = {
  id: string;
  title: string;
  category: string;
  content: string;
  status: KnowledgeStatus;
  created_at: string;
  updated_at: string;
};

export const KNOWLEDGE_CATEGORIES = [
  "Getting Started",
  "Devices",
  "MQTT / Connectivity",
  "Dashboard",
  "Sensor",
  "Automation",
  "AI Analysis",
  "API",
  "Plans & Pricing",
  "Billing & Payment",
  "Account",
  "Troubleshooting",
  "General FAQ",
] as const;

const MAX_CONTEXT_ENTRIES = 3;
const MAX_CONTENT_CHARS_PER_ENTRY = 800; // bounds prompt size even if an article is long

export async function listKnowledge(): Promise<KnowledgeEntry[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("support_knowledge_base").select("*").order("updated_at", { ascending: false });
  return (data ?? []) as KnowledgeEntry[];
}

export async function getKnowledgeEntry(id: string): Promise<KnowledgeEntry | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("support_knowledge_base").select("*").eq("id", id).maybeSingle();
  return (data as KnowledgeEntry | null) ?? null;
}

export async function createKnowledgeEntry(entry: { title: string; category: string; content: string; status: KnowledgeStatus }) {
  const admin = createAdminClient();
  return admin.from("support_knowledge_base").insert({ ...entry, updated_at: new Date().toISOString() });
}

export async function updateKnowledgeEntry(id: string, entry: { title: string; category: string; content: string; status: KnowledgeStatus }) {
  const admin = createAdminClient();
  return admin.from("support_knowledge_base").update({ ...entry, updated_at: new Date().toISOString() }).eq("id", id);
}

export async function deleteKnowledgeEntry(id: string) {
  const admin = createAdminClient();
  return admin.from("support_knowledge_base").delete().eq("id", id);
}

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "to", "of", "and", "or", "for", "how", "what", "why",
  "ที่", "และ", "หรือ", "ของ", "ใน", "ให้", "ได้", "เป็น", "มี", "จะ", "ค่ะ", "คะ", "ครับ", "คับ", "นะ", "แล้ว", "ยัง",
]);

function extractKeywords(query: string): string[] {
  return query
    .split(/[\s,./?!()]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w.toLowerCase()))
    .slice(0, 6);
}

/**
 * Returns the top few PUBLISHED entries relevant to the user's message,
 * truncated, for injection into the AI prompt. Plain keyword/ILIKE
 * matching across title+content — deliberately not a vector DB, this
 * scope doesn't need one, and it keeps every chat turn cheap since only
 * the few matched entries (never the whole table) go into the prompt.
 */
export async function findRelevantKnowledge(query: string): Promise<KnowledgeEntry[]> {
  const admin = createAdminClient();
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return [];

  const orClauses = keywords.flatMap((k) => [`title.ilike.%${k}%`, `content.ilike.%${k}%`]).join(",");
  const { data } = await admin
    .from("support_knowledge_base")
    .select("*")
    .eq("status", "published")
    .or(orClauses)
    .order("updated_at", { ascending: false })
    .limit(MAX_CONTEXT_ENTRIES);

  const rows = (data as KnowledgeEntry[] | null) ?? [];
  return rows.map((r) => ({ ...r, content: r.content.slice(0, MAX_CONTENT_CHARS_PER_ENTRY) }));
}
