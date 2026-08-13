import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatThaiDate } from "@/lib/payment";
import { PayButton } from "./_components/PayButton";

type Order = {
  id: string;
  order_number: string;
  product_name: string;
  quantity: number;
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
  created_at: string;
  paid_at: string | null;
};

const STATUS_BADGE: Record<Order["status"], { label: string; cls: string }> = {
  pending: { label: "รอชำระเงิน", cls: "bg-amber-100 text-amber-800" },
  paid: { label: "ชำระแล้ว รอจัดส่ง", cls: "bg-brand-100 text-brand-800" },
  shipped: { label: "จัดส่งแล้ว", cls: "bg-blue-100 text-blue-800" },
  delivered: { label: "ส่งมอบสำเร็จ", cls: "bg-green-100 text-green-800" },
  canceled: { label: "ยกเลิก", cls: "bg-red-100 text-red-800" },
};

export default async function OrdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("hardware_orders")
    .select(
      "id, order_number, product_name, quantity, amount, status, tracking_number, tracking_carrier, ship_name, ship_phone, ship_address, ship_city, ship_postal, ship_note, created_at, paid_at"
    )
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  const orders = (data ?? []) as Order[];

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href="/dashboard" className="hover:text-brand-900">← Dashboard</Link>
      </div>
      <h1 className="text-2xl font-bold text-brand-800">รายการสั่งซื้อ</h1>
      <p className="text-sm text-brand-900/60 mt-1">
        ประวัติการสั่งซื้อ SMF IoT Node ของคุณ
      </p>

      {orders.length === 0 ? (
        <div className="mt-8 card p-10 text-center">
          <div className="text-5xl">📦</div>
          <div className="mt-3 font-semibold text-brand-800">ยังไม่มีคำสั่งซื้อ</div>
          <p className="mt-1 text-sm text-brand-900/60">เริ่มสั่งซื้ออุปกรณ์แรกของคุณได้เลย</p>
          <Link href="/iot-nodes" className="mt-6 inline-flex rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2.5 text-sm transition">
            เลือกอุปกรณ์
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {orders.map((o) => {
            const badge = STATUS_BADGE[o.status];
            const paid = o.status !== "pending" && o.status !== "canceled";
            const shipped = o.status === "shipped" || o.status === "delivered";

            return (
              <div key={o.id} className="card p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-brand-700/70 font-medium">หมายเลขคำสั่งซื้อ</div>
                    <div className="font-mono text-lg font-bold text-brand-800">{o.order_number}</div>
                    <div className="text-xs text-brand-900/55 mt-0.5">
                      สั่งเมื่อ {formatThaiDate(o.created_at)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {o.status === "pending" && (
                      <PayButton
                        orderId={o.id}
                        orderNumber={o.order_number}
                        productName={o.product_name}
                        amount={o.amount}
                      />
                    )}
                    <div className={`text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full ${badge.cls}`}>
                      {badge.label}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-brand-900/55">สินค้า</div>
                    <div className="font-semibold text-brand-800">{o.product_name}</div>
                    <div className="text-xs text-brand-900/60">จำนวน {o.quantity} ชิ้น</div>
                  </div>
                  <div>
                    <div className="text-xs text-brand-900/55">ยอดชำระ</div>
                    <div className="font-semibold text-brand-800">฿{o.amount.toLocaleString()}</div>
                    <div className="text-xs text-brand-900/60">
                      สถานะการชำระ:{" "}
                      {o.status === "canceled"
                        ? "ยกเลิก"
                        : paid
                          ? "✓ ชำระแล้ว"
                          : "รอชำระ"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-brand-900/55">การจัดส่ง</div>
                    <div className="font-semibold text-brand-800">
                      {shipped ? "จัดส่งแล้ว" : paid ? "รอจัดเตรียม" : "-"}
                    </div>
                    {shipped && o.tracking_number ? (
                      <details className="mt-1">
                        <summary className="text-xs text-brand-700 cursor-pointer hover:text-brand-900">
                          หมายเลขติดตาม ▾
                        </summary>
                        <div className="text-xs text-brand-900/70 mt-1 font-mono">
                          {o.tracking_carrier ?? "ขนส่ง"}: {o.tracking_number}
                        </div>
                      </details>
                    ) : null}
                  </div>
                </div>

                <details className="mt-4 group">
                  <summary className="text-sm text-brand-700 hover:text-brand-900 cursor-pointer inline-flex items-center gap-1">
                    ที่อยู่จัดส่ง ▾
                  </summary>
                  <div className="mt-2 rounded-xl bg-brand-50/60 border border-brand-100 p-4 text-sm text-brand-900/85 space-y-1">
                    <div><span className="text-brand-900/55">ชื่อ:</span> {o.ship_name ?? "-"}</div>
                    <div><span className="text-brand-900/55">โทร:</span> {o.ship_phone ?? "-"}</div>
                    <div>
                      <span className="text-brand-900/55">ที่อยู่:</span>{" "}
                      {[o.ship_address, o.ship_city, o.ship_postal].filter(Boolean).join(", ") || "-"}
                    </div>
                    {o.ship_note && (
                      <div><span className="text-brand-900/55">หมายเหตุ:</span> {o.ship_note}</div>
                    )}
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
