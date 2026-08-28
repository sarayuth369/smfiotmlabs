import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getConversationForUser } from "@/lib/support/chat";
import { getSupportAiConfig } from "@/lib/support/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Returns the user's active conversation (if any) plus the public chat
 * settings (welcome message, assistant name) — never the provider/model,
 * that's server-internal only. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const cfg = await getSupportAiConfig();
  if (!cfg.enabled) {
    return NextResponse.json({ enabled: false });
  }

  const conversation = await getConversationForUser(user.id);
  return NextResponse.json({
    enabled: true,
    assistant_name: cfg.assistant_name,
    welcome_message: cfg.welcome_message,
    conversation_id: conversation?.id ?? null,
    status: conversation?.status ?? "AI_ACTIVE",
    messages: conversation?.messages ?? [],
  });
}
