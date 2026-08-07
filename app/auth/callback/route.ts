import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";
  const errorDescription = url.searchParams.get("error_description");

  if (errorDescription) {
    const back = new URL("/login", url.origin);
    back.searchParams.set("error", errorDescription);
    return NextResponse.redirect(back);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const back = new URL("/login", url.origin);
      back.searchParams.set("error", error.message);
      return NextResponse.redirect(back);
    }

    // Best-effort: ensure a profile row exists for OAuth users
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      await supabase.from("profiles").upsert(
        {
          id: user.id,
          email: user.email,
          full_name:
            (meta.full_name as string) ||
            (meta.name as string) ||
            user.email?.split("@")[0] ||
            null,
          avatar_url: (meta.avatar_url as string) || (meta.picture as string) || null,
          provider: user.app_metadata?.provider ?? "email",
        },
        { onConflict: "id" }
      );
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
