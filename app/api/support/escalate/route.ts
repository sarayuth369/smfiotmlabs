import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { escalateConversation } from "@/lib/support/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

type Body = { reason?: string; conversation_id?: string | null };

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
  const displayName = (profile?.full_name as string | undefined) || user.email?.split("@")[0] || "ลูกค้า";

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    // reason is optional — an empty body is fine
  }

  const result = await escalateConversation(user.id, user.email ?? "", displayName, String(body.reason ?? ""), body.conversation_id ?? null);
  if (!result.ok) return NextResponse.json({ error: result.error ?? "escalation failed" }, { status: 502 });
  return NextResponse.json({ ok: true });
}
