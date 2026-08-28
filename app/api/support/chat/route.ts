import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendSupportMessage } from "@/lib/support/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Body = { message?: string };

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const message = String(body.message ?? "").trim();
  if (!message) return NextResponse.json({ error: "message is required" }, { status: 400 });

  const result = await sendSupportMessage(supabase, user.id, message);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  return NextResponse.json({
    conversation_id: result.conversationId,
    reply: result.reply,
    suggest_escalation: result.suggestEscalation,
    status: result.status,
  });
}
