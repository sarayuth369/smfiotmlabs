"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SKU } from "@/lib/hardware";
import { startCheckout, pollCheckout } from "../actions";

type Item = { sku: SKU; name: string; price: number };
type State = "form" | "loading" | "waiting" | "processing" | "succeeded" | "expired" | "error";

export function CheckoutClient({
  item,
  defaultName,
  defaultPhone,
}: {
  item: Item;
  defaultName: string;
  defaultPhone: string;
}) {
  const [state, setState] = useState<State>("form");
  const [qty, setQty] = useState(1);
  const [pid, setPid] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [amount, setAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const total = item.price * qty;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setState("loading");
    const fd = new FormData(e.currentTarget);
    fd.set("quantity", String(qty));
    const res = await startCheckout(item.sku, fd);
    if (!res.ok) {
      setState("error");
      setError(res.error);
      return;
    }
    setPid(res.paymentIntentId);
    setQrUrl(res.qrImageUrl);
    setOrderNumber(res.orderNumber);
    setAmount(res.amount);
    setState("waiting");
  }

  useEffect(() => {
    if (!pid || state === "succeeded" || state === "expired" || state === "error") {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }
    pollingRef.current = setInterval(async () => {
      const res = await pollCheckout(pid);
      if (res.status === "succeeded") setState("succeeded");
      else if (res.status === "canceled") setState("expired");
      else if (res.status === "processing") setState("processing");
      else if (res.status === "error") {
        setState("error");
        setError(res.error);
      }
    }, 3000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = null;
    };
  }, [pid, state]);

  if (state === "succeeded") {
    return (
      <div className="max-w-xl mx-auto card p-8 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-brand-600 text-white flex items-center justify-center text-3xl">✓</div>
        <h2 className="mt-4 text-xl font-bold text-brand-800">ชำระเงินสำเร็จ</h2>
        <p className="mt-2 text-sm text-brand-900/70">
          หมายเลขคำสั่งซื้อ: <span className="font-mono font-semibold">{orderNumber}</span>
          <br />ระบบจะจัดส่ง {item.name} × {qty} ตามที่อยู่ที่กรอกไว้
        </p>
        <div className="mt-6 flex flex-wrap gap-2 justify-center">
          <Link href="/dashboard/orders" className="rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2.5 text-sm transition">ดูรายการสั่งซื้อ</Link>
          <Link href="/dashboard" className="rounded-full border border-border hover:bg-brand-50 text-brand-800 font-medium px-6 py-2.5 text-sm transition">กลับ Dashboard</Link>
        </div>
      </div>
    );
  }

  if (state === "expired") {
    return (
      <div className="max-w-xl mx-auto card p-8 text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-2xl">⏱</div>
        <h2 className="mt-4 text-lg font-bold text-brand-800">QR หมดอายุ</h2>
        <p className="mt-2 text-sm text-brand-900/70">การชำระเงินยกเลิกหรือหมดเวลา กรุณาเริ่มใหม่</p>
        <button type="button" onClick={() => { setState("form"); setPid(null); setQrUrl(null); }} className="mt-6 rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2.5 text-sm transition">เริ่มสั่งซื้อใหม่</button>
      </div>
    );
  }

  if (state === "waiting" || state === "processing" || state === "loading") {
    const displayAmount = amount || total; // fallback to form total while Stripe call in-flight
    return (
      <div className="max-w-xl mx-auto card p-6 sm:p-8">
        <div className="text-xs text-brand-700/70 font-medium">หมายเลขคำสั่งซื้อ</div>
        <div className="font-mono text-lg font-bold text-brand-800">
          {orderNumber ?? (
            <span className="text-brand-900/40 text-sm font-sans font-normal">กำลังสร้าง...</span>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/40 p-4">
          <div className="flex justify-between text-sm">
            <span className="text-brand-900/70">{item.name} × {qty}</span>
            <span className="font-semibold text-brand-800">฿{displayAmount.toLocaleString()}</span>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-brand-100 p-4 bg-white text-center">
          <div className="text-xs text-brand-900/60">ชำระผ่าน PromptPay</div>
          <div className="text-3xl font-extrabold text-brand-800 mt-1">฿{displayAmount.toLocaleString()}</div>
          <div className="mt-1 text-[11px] text-brand-900/55">ประมวลผลโดย Stripe</div>
          <div className="mt-4 mx-auto w-60 h-60 bg-white rounded-xl border border-border flex items-center justify-center overflow-hidden">
            {state === "loading" ? (
              <div className="text-xs text-brand-900/50 text-center px-4">
                กำลังติดต่อ Stripe...<br />
                <span className="opacity-60">รอสักครู่ (5–10 วินาที)</span>
              </div>
            ) : qrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrUrl} alt="PromptPay QR" className="w-full h-full" />
            ) : (
              <div className="text-xs text-brand-900/50">รอ QR...</div>
            )}
          </div>
          <div className="mt-3 text-[11px] text-brand-900/55">สแกนด้วยแอปธนาคาร • QR ใช้ได้ ~10 นาที</div>
        </div>

        <div className="mt-5 flex items-center justify-center gap-2 text-sm text-brand-700">
          <span className="relative flex w-2.5 h-2.5">
            <span className="animate-ping absolute inset-0 rounded-full bg-brand-400 opacity-75" />
            <span className="relative rounded-full w-2.5 h-2.5 bg-brand-500" />
          </span>
          {state === "loading"
            ? "กำลังสร้างคำสั่งซื้อ..."
            : state === "processing"
              ? "กำลังยืนยันการชำระเงิน..."
              : "รอการชำระเงิน — บันทึกออเดอร์อัตโนมัติเมื่อได้รับเงิน"}
        </div>

        {state !== "loading" && (
          <button
            type="button"
            onClick={() => { setState("form"); setPid(null); setQrUrl(null); setOrderNumber(null); setAmount(0); }}
            className="mt-4 w-full rounded-xl border border-border hover:bg-brand-50 text-brand-800 font-medium py-2.5 transition"
          >
            ยกเลิก / กลับไปแก้ไข
          </button>
        )}
      </div>
    );
  }

  // state === "form" or "error"
  return (
    <form onSubmit={submit} className="max-w-2xl mx-auto space-y-6">
      <div className="card p-6">
        <div className="text-xs text-brand-700/70 font-medium">สินค้า</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-2">
          <div className="text-xl font-bold text-brand-800">{item.name}</div>
          <div className="text-sm text-brand-900/60">฿{item.price.toLocaleString()} / ชิ้น</div>
        </div>

        <div className="mt-5">
          <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">จำนวน (1–100)</label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setQty(Math.max(1, qty - 1))} className="w-9 h-9 rounded-lg border border-border hover:bg-brand-50 text-brand-800 font-bold">−</button>
            <input type="number" min={1} max={100} value={qty} onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setQty(Math.max(1, Math.min(100, v))); }} className="w-24 rounded-lg border border-border px-3 py-2 text-center outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
            <button type="button" onClick={() => setQty(Math.min(100, qty + 1))} className="w-9 h-9 rounded-lg border border-border hover:bg-brand-50 text-brand-800 font-bold">+</button>
            <div className="ml-auto text-right">
              <div className="text-xs text-brand-900/55">รวม</div>
              <div className="text-xl font-extrabold text-brand-800">฿{total.toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <div className="text-sm font-semibold text-brand-800">ที่อยู่จัดส่ง</div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-brand-900/70 mb-1">ชื่อผู้รับ *</label>
            <input name="ship_name" required defaultValue={defaultName} placeholder="สมชาย ใจดี" className="w-full rounded-lg border border-border px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-brand-900/70 mb-1">เบอร์โทร *</label>
            <input name="ship_phone" required defaultValue={defaultPhone} placeholder="0812345678" className="w-full rounded-lg border border-border px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-brand-900/70 mb-1">ที่อยู่ *</label>
          <textarea name="ship_address" required rows={3} placeholder="เลขที่, ซอย, ถนน, ตำบล/แขวง, อำเภอ/เขต" className="w-full rounded-lg border border-border px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-brand-900/70 mb-1">จังหวัด *</label>
            <input name="ship_city" required placeholder="กรุงเทพมหานคร" className="w-full rounded-lg border border-border px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-brand-900/70 mb-1">รหัสไปรษณีย์ *</label>
            <input name="ship_postal" required inputMode="numeric" pattern="\d{5}" placeholder="10110" className="w-full rounded-lg border border-border px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-brand-900/70 mb-1">หมายเหตุ (ไม่บังคับ)</label>
          <textarea name="ship_note" rows={2} placeholder="ฝากคำแนะนำเพิ่มเติมให้ผู้จัดส่ง" className="w-full rounded-lg border border-border px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <div className="rounded-xl bg-brand-800 text-white p-4 flex items-baseline justify-between">
        <div>
          <div className="text-xs opacity-70">ยอดชำระรวม</div>
          <div className="text-xs opacity-60 mt-0.5">฿{item.price.toLocaleString()} × {qty} ชิ้น</div>
        </div>
        <div className="text-3xl font-extrabold">฿{total.toLocaleString()}</div>
      </div>

      <button type="submit" className="w-full rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 transition">
        ดำเนินการชำระเงิน (PromptPay)
      </button>

      <p className="text-xs text-brand-900/50 text-center">
        * ข้อมูลจะถูกเก็บถาวรเมื่อชำระเงินสำเร็จเท่านั้น
      </p>
    </form>
  );
}
