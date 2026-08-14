import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatThaiDateTime } from "@/lib/payment";
import { DeletePlanOrderButton } from "./_components/DeletePlanOrderButton";

type Row = {
  id: string;
  order_number: string | null;
  user_id: string;
  user_name: string | null;
  plan: "pro" | "business";
  months: number | null;
  amount: number;
  method: string | null;
  status: "pending" | "verified" | "rejected";
  is_renew: boolean | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
  verified_at: string | null;
};

const STATUS_BADGE: Record<Row["status"], { label: string; cls: string }> = {
  pending: { label: "รอชำระ", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  verified: { label: "ชำระแล้ว", cls: "bg-brand-50 text-brand-800 border-brand-200" },
  rejected: { label: "ยกเลิก / ปฏิเสธ", cls: "bg-red-50 text-red-800 border-red-200" },
};

function kindLabel(plan: string, isRenew: boolean | null): string {
  if (isRenew) return "Renew";
  if (plan === "pro") return "Upgrade Pro";
  if (plan === "business") return "Upgrade Business";
  return plan;
}

function kindColor(plan: string, isRenew: boolean | null): string {
  if (isRenew) return "bg-sky-100 text-sky-800";
  if (plan === "business") return "bg-brand-900 text-white";
  return "bg-brand-600 text-white";
}

export default async function PlanOrdersPage() {
  await requireModule("plan_orders");
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from("payment_requests")
    .select(
      "id, order_number, user_id, user_name, plan, months, amount, method, status, is_renew, stripe_payment_intent_id, created_at, verified_at"
    )
    .order("created_at", { ascending: false });

  const list = (rows ?? []) as Row[];

  // Batch-fetch emails from profiles for display
  const userIds = [...new Set(list.map((r) => r.user_id))];
  const { data: profs } = userIds.length
    ? await admin.from("profiles").select("id, email, full_name").in("id", userIds)
    : { data: [] as { id: string; email: string | null; full_name: string | null }[] };
  const byId = new Map((profs ?? []).map((p) => [p.id, p]));

  // Simple summary counts
  const total = list.length;
  const paid = list.filter((r) => r.status === "verified").length;
  const pending = list.filter((r) => r.status === "pending").length;
  const revenue = list
    .filter((r) => r.status === "verified")
    .reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div>
      <div className="mb-6">
        <div className="text-xs text-brand-700/70 font-medium">รายงาน</div>
        <h1 className="text-2xl font-bold text-brand-800">Plan Upgrade / Renew Orders</h1>
        <p className="text-sm text-brand-900/60 mt-1">
          รายการชำระเงินอัปเกรด / ต่ออายุแพ็กเกจ Pro & Business
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="card p-4">
          <div className="text-xs text-brand-900/55">ทั้งหมด</div>
          <div className="text-2xl font-bold text-brand-800">{total}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-brand-900/55">ชำระแล้ว</div>
          <div className="text-2xl font-bold text-brand-700">{paid}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-brand-900/55">รอชำระ</div>
          <div className="text-2xl font-bold text-amber-700">{pending}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-brand-900/55">รายได้รวม</div>
          <div className="text-2xl font-bold text-brand-800">฿{revenue.toLocaleString()}</div>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-5xl">💳</div>
          <div className="mt-3 font-semibold text-brand-800">ยังไม่มีคำสั่งซื้อแพ็กเกจ</div>
        </div>
      ) : (
        <div className="space-y-4">
          {list.map((o) => {
            const badge = STATUS_BADGE[o.status];
            const p = byId.get(o.user_id);
            const label = o.order_number ?? o.id.slice(0, 8);

            return (
              <div key={o.id} className="card p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-brand-700/70 font-medium">Order</div>
                    <div className="font-mono text-lg font-bold text-brand-800">{label}</div>
                    <div className="text-xs text-brand-900/55 mt-0.5">
                      สั่งเมื่อ {formatThaiDateTime(o.created_at)}
                      {o.verified_at && ` • ชำระ ${formatThaiDateTime(o.verified_at)}`}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className={`text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full ${kindColor(o.plan, o.is_renew)}`}>
                      {kindLabel(o.plan, o.is_renew)}
                    </div>
                    <div className={`text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${badge.cls}`}>
                      {badge.label}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-brand-900/55">ลูกค้า</div>
                    <div className="font-semibold text-brand-800">
                      {o.user_name || p?.full_name || "-"}
                    </div>
                    <div className="text-xs text-brand-900/60 break-all">{p?.email ?? "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-brand-900/55">แพ็กเกจ</div>
                    <div className="font-semibold text-brand-800 capitalize">{o.plan}</div>
                    <div className="text-xs text-brand-900/60">
                      จำนวน {o.months ?? 1} เดือน • {o.method ?? "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-brand-900/55">ยอดชำระ</div>
                    <div className="font-semibold text-brand-800">฿{Number(o.amount).toLocaleString()}</div>
                  </div>
                </div>

                {o.stripe_payment_intent_id && (
                  <details className="mt-3">
                    <summary className="text-xs text-brand-700 cursor-pointer hover:text-brand-900">
                      Stripe Payment Intent ▾
                    </summary>
                    <div className="mt-1 text-xs text-brand-900/70 font-mono break-all">
                      {o.stripe_payment_intent_id}
                    </div>
                  </details>
                )}

                <DeletePlanOrderButton orderId={o.id} orderLabel={label} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
