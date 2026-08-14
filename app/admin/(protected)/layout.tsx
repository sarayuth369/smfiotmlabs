import Link from "next/link";
import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/admin/current";
import { canAccess, ROLE_LABEL } from "@/lib/admin/rbac";
import { adminLogout } from "@/app/admin/login/actions";

type NavItem = { href: string; label: string; mod: Parameters<typeof canAccess>[1] };

const NAV: NavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", mod: "dashboard" },
  { href: "/admin/notifications", label: "Notifications", mod: "notifications" },
  { href: "/admin/pricing", label: "Subscription Plans", mod: "pricing" },
  { href: "/admin/products", label: "IoT Node Prices", mod: "products" },
  { href: "/admin/plan-orders", label: "Plan Upgrade / Renew", mod: "plan_orders" },
  { href: "/admin/orders", label: "Hardware Orders", mod: "orders" },
  { href: "/admin/settings", label: "System Settings", mod: "settings" },
  { href: "/admin/admin-users", label: "Admin Users", mod: "admin_users" },
];

export default async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  const session = await requireAdmin();

  return (
    <div className="min-h-screen bg-[var(--surface-alt)] flex">
      {/* Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-brand-900 text-white sticky top-0 h-screen">
        <div className="px-6 py-5 border-b border-white/10">
          <Link href="/admin/dashboard" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center font-black text-lg">A</div>
            <div className="leading-tight">
              <div className="font-bold">SMF IoT</div>
              <div className="text-[10px] text-white/60">Admin Control</div>
            </div>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.filter((n) => canAccess(session.role, n.mod)).map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="block rounded-lg px-3 py-2 text-sm text-white/85 hover:bg-white/10 hover:text-white transition"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-white/10 text-xs text-white/60">
          <div className="font-semibold text-white/85">{session.username}</div>
          <div className="mt-0.5">{ROLE_LABEL[session.role]}</div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-white/85 backdrop-blur border-b border-border">
          <div className="px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="lg:hidden font-bold text-brand-800">SMF Admin</span>
              <div className="hidden lg:block text-sm text-brand-900/60">Control Center</div>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/" className="text-xs text-brand-700 hover:text-brand-900">← กลับหน้าเว็บ</Link>
              <form action={adminLogout}>
                <button
                  type="submit"
                  className="text-xs rounded-full border border-border hover:border-red-300 hover:bg-red-50 hover:text-red-700 text-brand-800 px-3 py-1.5 font-medium transition"
                >
                  ออกจากระบบ
                </button>
              </form>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
