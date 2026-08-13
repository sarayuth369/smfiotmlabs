import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatThaiDateTime } from "@/lib/payment";
import { updateOrder } from "./actions";
import { DeleteOrderButton } from "./_components/DeleteOrderButton";

type Order = {
  id: string;
  order_number: string | null;
  user_id: string;
  product_name: string;
  sku: string;
  quantity: number;
  unit_price: number | null;
  amount: number;
  status: "pending" | "paid" | "shipped" | "delivered" | "canceled";
  tracking_number: string | null;
  tracking_carrier: string | null;
  ship_name: string | null;
  ship_phone: string | null;
  ship_address: string | null;
  ship_city: string | null;
  ship_postal: string | null;
  ship_note: string | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
  paid_at: string | null;
};

const STATUS_BADGE: Record<Order["status"], { label: string; cls: string }> = {
  pending: { label: "รอชำระ", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  paid: { label: "ชำระแล้ว", cls: "bg-brand-100 text-brand-800 border-brand-200" },
  shipped: { label: "จัดส่งแล้ว", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  delivered: { label: "ส่งมอบสำเร็จ", cls: "bg-green-100 text-green-800 border-green-200" },
  canceled: { label: "ยกเลิก", cls: "bg-red-100 text-red-800 border-red-200" },
};

const CARRIERS = [
  "Kerry Express",
  "Flash Express",
  "Thailand Post — EMS",
  "Thailand Post — Registered",
  "J&T Express",
  "Ninja Van",
  "SCG Express",
  "DHL",
  "Best Express",
  "อื่น ๆ",
];

export default async function AdminOrdersPage() {
  await requireModule("orders");

  const admin = createAdminClient();
  const { data } = await admin
    .from("hardware_orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  const orders = (data ?? []) as Order[];

  // Fetch emails for user_ids (via profiles)
  const userIds = Array.from(new Set(orders.map((o) => o.user_id)));
  let emailMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email, full_name")
      .in("id", userIds);
    emailMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.email ?? ""]));
  }

  const counts = orders.reduce(
    (acc, o) => {
      acc[o.status] = (acc[o.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<Order["status"], number>
  );

  return (
    <div>
      <div className="text-xs text-brand-700/70 font-medium">Store</div>
      <h1 className="text-2xl font-bold text-brand-800">Hardware Orders</h1>
      <p className="text-sm text-brand-900/60 mt-1">
        จัดการคำสั่งซื้อ SMF IoT Node • อัปเดตสถานะและเลขติดตามพัสดุได้จากที่นี่
      </p>

      <div className="mt-5 grid grid-cols-2 sm:grid-cols-5 gap-3">
        {(["pending", "paid", "shipped", "delivered", "canceled"] as const).map((s) => (
          <div key={s} className="card p-4">
            <div className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${STATUS_BADGE[s].cls}`}>
              {STATUS_BADGE[s].label}
            </div>
            <div className="mt-2 text-2xl font-extrabold text-brand-800">{counts[s] ?? 0}</div>
          </div>
        ))}
      </div>

      {orders.length === 0 ? (
        <div className="mt-8 card p-10 text-center text-brand-900/60">
          ยังไม่มีคำสั่งซื้อ
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {orders.map((o) => {
            const badge = STATUS_BADGE[o.status];
            const customerEmail = emailMap[o.user_id] || "-";
            return (
              <div key={o.id} className="card p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-brand-700/70 font-medium">Order</div>
                    <div className="font-mono text-lg font-bold text-brand-800">
                      {o.order_number ?? o.id.slice(0, 8)}
                    </div>
                    <div className="text-xs text-brand-900/55 mt-0.5">
                      สั่งเมื่อ {formatThaiDateTime(o.created_at)}
                      {o.paid_at && ` • ชำระ ${formatThaiDateTime(o.paid_at)}`}
                    </div>
                  </div>
                  <div className={`text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${badge.cls}`}>
                    {badge.label}
                  </div>
                </div>

                <div className="mt-4 grid sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-brand-900/55">ลูกค้า</div>
                    <div className="font-semibold text-brand-800 truncate">{o.ship_name || "-"}</div>
                    <div className="text-xs text-brand-900/60 truncate">{customerEmail}</div>
                    <div className="text-xs text-brand-900/60">{o.ship_phone || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-brand-900/55">สินค้า</div>
                    <div className="font-semibold text-brand-800">{o.product_name}</div>
                    <div className="text-xs text-brand-900/60">SKU: {o.sku} • {o.quantity} ชิ้น</div>
                  </div>
                  <div>
                    <div className="text-xs text-brand-900/55">ยอดชำระ</div>
                    <div className="font-semibold text-brand-800">฿{o.amount.toLocaleString()}</div>
                    {o.unit_price != null && (
                      <div className="text-xs text-brand-900/60">
                        ฿{o.unit_price.toLocaleString()} × {o.quantity}
                      </div>
                    )}
                  </div>
                </div>

                <details className="mt-3">
                  <summary className="text-sm text-brand-700 hover:text-brand-900 cursor-pointer">
                    ที่อยู่จัดส่ง + Stripe PI ▾
                  </summary>
                  <div className="mt-2 rounded-xl bg-brand-50/60 border border-brand-100 p-4 text-sm text-brand-900/85 space-y-1">
                    <div>
                      <span className="text-brand-900/55">ที่อยู่:</span>{" "}
                      {[o.ship_address, o.ship_city, o.ship_postal].filter(Boolean).join(", ") || "-"}
                    </div>
                    {o.ship_note && (
                      <div><span className="text-brand-900/55">หมายเหตุลูกค้า:</span> {o.ship_note}</div>
                    )}
                    {o.stripe_payment_intent_id && (
                      <div className="text-xs">
                        <span className="text-brand-900/55">Stripe PI:</span>{" "}
                        <span className="font-mono">{o.stripe_payment_intent_id}</span>
                      </div>
                    )}
                  </div>
                </details>

                <form action={updateOrder.bind(null, o.id)} className="mt-4 grid sm:grid-cols-4 gap-3 items-end">
                  <div>
                    <label className="block text-xs font-semibold text-brand-900/70 mb-1">สถานะ</label>
                    <select
                      name="status"
                      defaultValue={o.status}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    >
                      <option value="pending">รอชำระ</option>
                      <option value="paid">ชำระแล้ว</option>
                      <option value="shipped">จัดส่งแล้ว</option>
                      <option value="delivered">ส่งมอบสำเร็จ</option>
                      <option value="canceled">ยกเลิก</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-brand-900/70 mb-1">บริษัทขนส่ง</label>
                    <input
                      list={`carriers-${o.id}`}
                      name="tracking_carrier"
                      defaultValue={o.tracking_carrier ?? ""}
                      placeholder="เช่น Kerry Express"
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    />
                    <datalist id={`carriers-${o.id}`}>
                      {CARRIERS.map((c) => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-brand-900/70 mb-1">เลขติดตามพัสดุ</label>
                    <input
                      name="tracking_number"
                      defaultValue={o.tracking_number ?? ""}
                      placeholder="TH1234567890"
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    />
                  </div>
                  <button
                    type="submit"
                    className="h-[38px] rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 text-sm transition"
                  >
                    Update
                  </button>
                </form>

                <DeleteOrderButton
                  orderId={o.id}
                  orderLabel={o.order_number ?? o.id.slice(0, 8)}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
