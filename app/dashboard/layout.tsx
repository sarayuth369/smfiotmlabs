import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const displayName =
    (meta.full_name as string) ||
    (meta.name as string) ||
    user?.email?.split("@")[0] ||
    "สมาชิก";
  const avatar = (meta.avatar_url as string) || (meta.picture as string) || null;

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur border-b border-brand-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/images/logo.png" alt="M Labs" width={36} height={36} className="object-contain" />
            <div className="leading-tight">
              <div className="font-bold text-brand-800 text-lg">SMF IoT</div>
              <div className="text-[10px] text-brand-700/70 -mt-0.5">Member area</div>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-3 pr-3 border-r border-brand-100">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="" className="w-8 h-8 rounded-full object-cover border border-brand-100" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="text-sm">
                <div className="font-semibold text-brand-800 leading-tight">{displayName}</div>
                <div className="text-[11px] text-brand-900/55 leading-tight">{user?.email}</div>
              </div>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-full border border-brand-200 hover:border-brand-400 text-brand-800 px-4 py-2 text-sm font-semibold transition"
              >
                ออกจากระบบ
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">{children}</main>
    </div>
  );
}
