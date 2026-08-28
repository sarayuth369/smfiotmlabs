import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupportAiConfig } from "@/lib/support/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public chat settings only (welcome message, assistant name) — never
 * the provider/model, that's server-internal only. Deliberately does NOT
 * return a prior conversation/messages: the widget always starts a fresh
 * conversation on open (old ones stay in the DB, just never auto-resumed
 * into the UI), so there's nothing to restore here. */
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

  return NextResponse.json({
    enabled: true,
    assistant_name: cfg.assistant_name,
    welcome_message: cfg.welcome_message,
  });
}
