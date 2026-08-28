import { NextResponse } from "next/server";
import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** TEMPORARY diagnostic route — isolates whether the app's service-role
 * client can see support_knowledge_base rows at all, independent of the
 * chat/AI pipeline. Admin-only. Remove once the KB retrieval issue is
 * root-caused. */
export async function GET() {
  await requireModule("support_chat");
  const admin = createAdminClient();

  const all = await admin.from("support_knowledge_base").select("id, title, status");
  const published = await admin.from("support_knowledge_base").select("id, title, status").eq("status", "published");

  return NextResponse.json({
    supabase_url_host: (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/^https?:\/\//, "").split(".")[0],
    all_query: { error: all.error?.message ?? null, count: all.data?.length ?? 0, rows: all.data ?? [] },
    published_query: { error: published.error?.message ?? null, count: published.data?.length ?? 0, rows: published.data ?? [] },
  });
}
