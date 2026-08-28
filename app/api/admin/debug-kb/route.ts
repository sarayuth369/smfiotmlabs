import { NextResponse } from "next/server";
import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";
import { findRelevantKnowledge } from "@/lib/support/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function codePoints(s: string): string[] {
  return [...s].map((c) => c.codePointAt(0)!.toString(16));
}

/** TEMPORARY diagnostic route — isolates whether the app's service-role
 * client can see support_knowledge_base rows at all, independent of the
 * chat/AI pipeline, and (with ?q=) runs the real findRelevantKnowledge()
 * against text typed live in the browser to rule out an encoding
 * mismatch between admin-authored titles and user-typed chat messages.
 * Admin-only. Remove once the KB retrieval issue is root-caused. */
export async function GET(req: Request) {
  await requireModule("support_chat");
  const admin = createAdminClient();
  const q = new URL(req.url).searchParams.get("q");

  const all = await admin.from("support_knowledge_base").select("id, title, status");
  const published = await admin.from("support_knowledge_base").select("id, title, status").eq("status", "published");

  const result: Record<string, unknown> = {
    supabase_url_host: (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/^https?:\/\//, "").split(".")[0],
    all_query: { error: all.error?.message ?? null, count: all.data?.length ?? 0, rows: all.data ?? [] },
    published_query: { error: published.error?.message ?? null, count: published.data?.length ?? 0, rows: published.data ?? [] },
  };

  if (q) {
    const matched = await findRelevantKnowledge(q);
    result.query_test = {
      query_raw: q,
      query_codepoints: codePoints(q),
      match_count: matched.length,
      matched_titles: matched.map((m) => m.title),
      matched_title_codepoints: matched.map((m) => codePoints(m.title)),
      pro_title_codepoints: codePoints("แพ็กเกจ Pro"),
    };
  }

  return NextResponse.json(result);
}
