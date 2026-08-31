import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/admin/current";
import { formatThaiDate } from "@/lib/payment";
import { PLAN_INFO, type PlanId } from "@/lib/plans";

async function safeCount(table: string, filter?: (q: any) => any): Promise<number> {
  try {
    const admin = createAdminClient();
    let q: any = admin.from(table).select("id", { count: "exact", head: true });
    if (filter) q = filter(q);
    const { count } = await q;
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function safeSum(table: string, column: string, filter?: (q: any) => any): Promise<number> {
  try {
    const admin = createAdminClient();
    let q: any = admin.from(table).select(column);
    if (filter) q = filter(q);
    const { data } = await q;
    if (!data) return 0;
    return data.reduce((s: number, r: any) => s + Number(r[column] ?? 0), 0);
  } catch {
    return 0;
  }
}

export default async function AdminDashboard() {
  await requireModule("dashboard");
  const admin = createAdminClient();

  // KPIs
  const totalMembers = await safeCount("profiles");
  const activePro = await safeCount("profiles", (q: any) => q.eq("plan", "pro"));
  const activeBiz = await safeCount("profiles", (q: any) => q.eq("plan", "business"));
  const activePaidPlans = activePro + activeBiz;
  const totalHardwareOrders = await safeCount("hardware_orders");
  const paidHardware = await safeCount("hardware_orders", (q: any) => q.eq("status", "paid"));
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const revenuePlan = await safeSum("payment_requests", "amount", (q: any) =>
    q.eq("status", "verified").gte("created_at", monthStart.toISOString())
  );
  const revenueHw = await safeSum("hardware_orders", "amount", (q: any) =>
    q.eq("status", "paid").gte("created_at", monthStart.toISOString())
  );
  const monthlyRevenue = revenuePlan + revenueHw;

  // Recent activity
  const { data: recentMembers } = await admin
    .from("profiles")
    .select("id, email, full_name, plan, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  const { data: recentPayments } = await admin
    .from("payment_requests")
    .select("id, amount, plan, status, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  // Plan breakdown
  const planCounts: Record<PlanId, number> = {
    starter: await safeCount("profiles", (q: any) => q.eq("plan", "starter")),
    pro: activePro,
    business: activeBiz,
    enterprise: await safeCount("profiles", (q: any) => q.eq("plan", "enterprise")),
  };

  const dhHealthy = await safeCount("device_health", (q: any) => q.eq("status", "healthy"));
  const dhWarning = await safeCount("device_health", (q: any) => q.eq("status", "warning"));
  const dhCritical = await safeCount("device_health", (q: any) => q.eq("status", "critical"));
  const dhOffline = await safeCount("device_health", (q: any) => q.eq("status", "offline"));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-800">Dashboard</h1>
        <p className="text-sm text-brand-900/60 mt-0.5">ภาพรวมของระบบ SMF IoT</p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Total Members" value={totalMembers.toLocaleString()} />
        <Kpi label="Paid Plans (Pro + Business)" value={activePaidPlans.toLocaleString()} />
        <Kpi label="Hardware Orders" value={`${paidHardware.toLocaleString()} / ${totalHardwareOrders.toLocaleString()}`} sub="paid / total" />
        <Kpi label="Monthly Revenue" value={`฿${monthlyRevenue.toLocaleString()}`} sub={`ตั้งแต่ ${formatThaiDate(monthStart.toISOString())}`} />
      </div>

      {/* Device Health */}
      <section className="mt-8 card p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-brand-800">Device Health</h2>
          <Link href="/admin/device-health" className="text-sm text-brand-700 hover:text-brand-900 underline">ดูทั้งหมด →</Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <div className="text-xs text-brand-900/55">Healthy</div>
            <div className="text-2xl font-bold text-green-700">{dhHealthy.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs text-brand-900/55">Warning</div>
            <div className="text-2xl font-bold text-amber-700">{dhWarning.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs text-brand-900/55">Critical</div>
            <div className="text-2xl font-bold text-red-700">{dhCritical.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs text-brand-900/55">Offline</div>
            <div className="text-2xl font-bold text-brand-700/70">{dhOffline.toLocaleString()}</div>
          </div>
        </div>
      </section>

      {/* Plan breakdown */}
      <section className="mt-8 grid lg:grid-cols-3 gap-6">
        <div className="card p-6 lg:col-span-1">
          <h2 className="font-bold text-brand-800">Subscription Breakdown</h2>
          <ul className="mt-4 space-y-3">
            {(Object.keys(planCounts) as PlanId[]).map((p) => {
              const total = Math.max(1, totalMembers);
              const pct = Math.round((planCounts[p] / total) * 100);
              return (
                <li key={p}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-brand-800">{PLAN_INFO[p].name}</span>
                    <span className="text-brand-900/60">{planCounts[p]} ({pct}%)</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-brand-50 overflow-hidden">
                    <div className={`h-full ${p === "pro" ? "bg-brand-500" : p === "business" ? "bg-brand-700" : p === "enterprise" ? "bg-brand-900" : "bg-brand-300"}`} style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Recent members */}
        <div className="card p-6 lg:col-span-1">
          <h2 className="font-bold text-brand-800">สมาชิกใหม่ล่าสุด</h2>
          <div className="mt-3 divide-y divide-border">
            {(recentMembers ?? []).map((m: any) => (
              <div key={m.id} className="py-2.5">
                <div className="text-sm font-medium text-brand-800 truncate">{m.full_name || m.email}</div>
                <div className="flex items-center gap-2 text-xs text-brand-900/55 mt-0.5">
                  <span className="uppercase font-semibold">{m.plan}</span>
                  <span>·</span>
                  <span>{formatThaiDate(m.created_at)}</span>
                </div>
              </div>
            ))}
            {(!recentMembers || recentMembers.length === 0) && (
              <div className="text-sm text-brand-900/50 py-4">ยังไม่มีสมาชิก</div>
            )}
          </div>
        </div>

        {/* Recent payments */}
        <div className="card p-6 lg:col-span-1">
          <h2 className="font-bold text-brand-800">การชำระเงินล่าสุด</h2>
          <div className="mt-3 divide-y divide-border">
            {(recentPayments ?? []).map((p: any) => (
              <div key={p.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-brand-800 uppercase">{p.plan}</div>
                  <div className="text-xs text-brand-900/55">{formatThaiDate(p.created_at)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-brand-800">฿{Number(p.amount).toLocaleString()}</div>
                  <div className={`text-[10px] uppercase font-bold tracking-wider ${p.status === "verified" ? "text-brand-600" : p.status === "rejected" ? "text-red-600" : "text-amber-600"}`}>
                    {p.status}
                  </div>
                </div>
              </div>
            ))}
            {(!recentPayments || recentPayments.length === 0) && (
              <div className="text-sm text-brand-900/50 py-4">ยังไม่มีรายการ</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs text-brand-900/55 uppercase font-semibold tracking-wider">{label}</div>
      <div className="mt-2 text-3xl font-extrabold text-brand-800">{value}</div>
      {sub && <div className="text-[11px] text-brand-900/50 mt-1">{sub}</div>}
    </div>
  );
}
