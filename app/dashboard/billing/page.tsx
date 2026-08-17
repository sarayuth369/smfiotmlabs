import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatThaiDateTime } from "@/lib/payment";
import { getSubscriptionState, statusLabel } from "@/lib/subscription";
import { getUserPlan, formatPlanLabel } from "@/lib/plan-limits";

type PaymentRow = {
  id: string;
  order_number: string | null;
  plan: string;
  amount: number;
  method: string;
  months: number | null;
  status: string;
  is_renew: boolean | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
  verified_at: string | null;
};

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending: { label: "รอชำระ", className: "bg-amber-100 text-amber-800" },
  verified: { label: "ชำระแล้ว", className: "bg-emerald-100 text-emerald-800" },
  rejected: { label: "ยกเลิก", className: "bg-red-100 text-red-800" },
};

const SUB_STATUS_STYLE = {
  active: "bg-emerald-100 text-emerald-800",
  grace: "bg-amber-100 text-amber-800",
  expired: "bg-red-100 text-red-800",
} as const;

export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [sub, plan, paymentsRes] = await Promise.all([
    getSubscriptionState(supabase, user!.id),
    getUserPlan(supabase, user!.id),
    supabase
      .from("payment_requests")
      .select("id, order_number, plan, amount, method, months, status, is_renew, stripe_payment_intent_id, created_at, verified_at")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const payments = (paymentsRes.data ?? []) as PaymentRow[];

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href="/dashboard" className="hover:text-brand-900">← Dashboard</Link>
      </div>

      <h1 className="text-2xl font-bold text-brand-800">การชำระเงิน &amp; แพ็กเกจ</h1>
      <p className="text-sm text-brand-900/60 mt-1">ประวัติการชำระเงินและสถานะแพ็กเกจปัจจุบัน</p>

      {/* Subscription status card */}
      <div className="card p-6 mt-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs text-brand-900/60 font-medium uppercase tracking-wider">แพ็กเกจปัจจุบัน</div>
            <div className="mt-1 text-2xl font-bold text-brand-800">{plan.name}</div>
            <div className="text-sm text-brand-900/70">{formatPlanLabel(plan)}</div>
            {sub.set_plan !== sub.effective_plan && (
              <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 inline-block">
                Effective plan: <span className="font-bold uppercase">{sub.effective_plan}</span> — เนื่องจากแพ็กเกจ {sub.set_plan.toUpperCase()} หมดอายุและ Grace Period หมดลง
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full ${SUB_STATUS_STYLE[sub.status]}`}>
              {statusLabel(sub.status)}
            </span>
            {sub.expires_at && (
              <div className="text-xs text-brand-900/70">
                หมดอายุ: {formatThaiDateTime(sub.expires_at)}
              </div>
            )}
            {sub.status === "grace" && sub.grace_period_end && (
              <div className="text-xs text-amber-700">
                Grace ถึง {formatThaiDateTime(sub.grace_period_end)} ({sub.days_remaining} วัน)
              </div>
            )}
            {sub.status === "active" && sub.days_remaining !== null && sub.days_remaining > 0 && (
              <div className="text-xs text-brand-900/70">
                เหลืออีก {sub.days_remaining} วัน
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 text-sm transition"
          >
            {sub.set_plan === "starter" ? "อัปเกรดแพ็กเกจ" : "ต่ออายุ / เปลี่ยนแพ็กเกจ"}
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 hover:border-brand-400 text-brand-800 font-semibold px-4 py-2 text-sm transition"
          >
            กลับ Dashboard
          </Link>
        </div>
      </div>

      {/* Payment history */}
      <div className="mt-8">
        <h2 className="text-lg font-bold text-brand-800 mb-3">ประวัติการชำระเงิน</h2>

        {payments.length === 0 ? (
          <div className="card p-10 text-center">
            <div className="text-4xl">🧾</div>
            <div className="mt-3 font-semibold text-brand-800">ยังไม่มีประวัติการชำระเงิน</div>
            <p className="mt-1 text-sm text-brand-900/60">
              เมื่อคุณอัปเกรดหรือต่ออายุแพ็กเกจ รายการจะปรากฏที่นี่
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {payments.map((p) => {
              const st = STATUS_LABEL[p.status] ?? { label: p.status, className: "bg-brand-100 text-brand-800" };
              return (
                <div key={p.id} className="card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-brand-900/60">
                          {p.order_number ?? p.id.slice(0, 8)}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-100 text-brand-700">
                          {p.is_renew ? "ต่ออายุ" : "อัปเกรด"}
                        </span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${st.className}`}>
                          {st.label}
                        </span>
                      </div>
                      <div className="mt-1 font-bold text-brand-800">
                        แพ็กเกจ <span className="uppercase">{p.plan}</span>
                        {p.months && p.months > 1 && (
                          <span className="ml-2 text-sm font-normal text-brand-900/60">
                            × {p.months} เดือน
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-brand-900/55 mt-0.5">
                        {p.method === "promptpay" ? "PromptPay QR (Stripe)" : p.method} • สร้างเมื่อ {formatThaiDateTime(p.created_at)}
                        {p.verified_at && ` • ชำระเมื่อ ${formatThaiDateTime(p.verified_at)}`}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xl font-extrabold text-brand-800">
                        ฿{Number(p.amount).toLocaleString()}
                      </div>
                      {p.status === "pending" && (
                        <Link
                          href="/dashboard/orders"
                          className="mt-1 inline-block text-xs text-brand-700 hover:text-brand-900 underline"
                        >
                          ชำระเงิน →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
