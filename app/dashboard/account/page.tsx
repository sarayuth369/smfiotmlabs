import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./_components/ProfileForm";
import { PasswordForm } from "./_components/PasswordForm";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone")
    .eq("id", user!.id)
    .single();

  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const provider = (user?.app_metadata?.provider ?? "email") as string;
  const initialName =
    profile?.full_name ||
    (meta.full_name as string) ||
    (meta.name as string) ||
    "";
  const initialPhone = profile?.phone || (meta.phone as string) || "";

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href="/dashboard" className="hover:text-brand-900">← Dashboard</Link>
      </div>
      <h1 className="text-2xl font-bold text-brand-800">Account</h1>
      <p className="text-sm text-brand-900/60 mt-1">
        จัดการข้อมูลส่วนตัวและรหัสผ่านของคุณ
      </p>

      <div className="mt-6 space-y-6">
        <ProfileForm
          email={user!.email ?? ""}
          initialName={initialName}
          initialPhone={initialPhone}
          provider={provider}
        />
        <PasswordForm provider={provider} />
      </div>
    </div>
  );
}
