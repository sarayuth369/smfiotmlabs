/**
 * Support Knowledge Base — admin CRUD + retrieval for the chat.
 *
 * Retrieval is deliberately simple, not a vector DB — this scope doesn't
 * need one yet, and it keeps every chat turn cheap: only the few relevant
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

const MAX_CONTEXT_ENTRIES = 5;
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

// Common alternate Thai spellings for the same word — plain substring
// matching treats these as completely different strings otherwise.
// Confirmed live: a customer typing "แพคเกจ" (with ค) got zero KB matches
// against articles titled "แพ็กเกจ" (with ็ + ก) despite being the same
// word "package" — every automated test up to that point had (without
// realizing it) only ever used the ็ก spelling. Extend this list as more
// variants turn up; it's applied to both the query and article text so
// either spelling on either side still matches.
const SPELLING_VARIANTS: [RegExp, string][] = [[/แพคเกจ/g, "แพ็กเกจ"]];

function normalizeSpelling(text: string): string {
  return SPELLING_VARIANTS.reduce((t, [pattern, canonical]) => t.replace(pattern, canonical), text);
}

function extractKeywords(text: string): string[] {
  return normalizeSpelling(text)
    .split(/[\s,./?!()]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w.toLowerCase()))
    .slice(0, 6);
}

/**
 * Returns the top few PUBLISHED entries relevant to the user's message,
 * truncated, for injection into the AI prompt.
 *
 * Matches in both directions because Thai is often typed with NO spaces
 * between words ("มีแพ็กเกจอะไรบ้างคับ" is one unbroken string) — splitting
 * only the user's message into keywords misses that entirely, since the
 * whole sentence never appears verbatim in any article. Splitting each
 * article's own title instead (admin-authored, reliably spaced, e.g.
 * "แพ็กเกจ Pro") and checking whether those words appear as a *substring*
 * of the raw, unsplit query catches the no-space case naturally. The KB
 * is small by design (admin-curated, not user-generated), so scoring
 * every published row in-process is cheap — no need for DB-side search
 * or a real Thai word segmenter at this scope.
 */
async function fetchPublishedEntries(): Promise<KnowledgeEntry[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("support_knowledge_base").select("*").eq("status", "published");
  if (error) console.warn("[support.knowledge] query error:", error.message, error.code);
  return (data as KnowledgeEntry[] | null) ?? [];
}

export async function findRelevantKnowledge(query: string): Promise<KnowledgeEntry[]> {
  const rows = await fetchPublishedEntries();
  if (rows.length === 0) return [];

  const queryLower = normalizeSpelling(query.toLowerCase());
  const queryKeywords = extractKeywords(query).map((w) => w.toLowerCase());

  const scored = rows
    .map((r) => {
      let score = 0;
      const titleWords = extractKeywords(r.title).map((w) => w.toLowerCase());
      // direction 1: article's own words found inside the raw query (handles no-space Thai)
      for (const w of titleWords) if (queryLower.includes(w)) score += 2;
      // direction 2: query's tokens found inside the article (handles spaced/English input)
      const haystack = normalizeSpelling((r.title + " " + r.content).toLowerCase());
      for (const k of queryKeywords) if (haystack.includes(k)) score += 1;
      return { entry: r, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.entry.updated_at).getTime() - new Date(a.entry.updated_at).getTime())
    .slice(0, MAX_CONTEXT_ENTRIES);

  return scored.map((s) => ({ ...s.entry, content: s.entry.content.slice(0, MAX_CONTENT_CHARS_PER_ENTRY) }));
}
