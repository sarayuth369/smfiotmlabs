"use client";

import { useEffect, useRef, useState } from "react";
import { resumeOrderPayment, pollOrderPayment } from "../actions";

type State = "loading" | "waiting" | "processing" | "succeeded" | "expired" | "error";

export function PayModal({
  open,
  orderId,
  orderNumber,
  productName,
  amount,
  onClose,
}: {
  open: boolean;
  orderId: string | null;
  orderNumber: string;
  productName: string;
  amount: number;
  onClose: () => void;
}) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [pid, setPid] = useState<string | null>(null);
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open || !orderId) return;
    setState("loading");
    setError(null);
    setQrUrl(null);
    setPid(null);

    let cancelled = false;
    (async () => {
      const res = await resumeOrderPayment(orderId);
      if (cancelled) return;
      if (!res.ok) {
        setState("error");
        setError(res.error);
        return;
      }
      setPid(res.paymentIntentId);
      setQrUrl(res.qrImageUrl);
      setState("waiting");
    })();

    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, orderId, onClose]);

  useEffect(() => {
    if (!pid || state === "succeeded" || state === "error" || state === "expired") {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = null;
      return;
    }
    pollingRef.current = setInterval(async () => {
      const res = await pollOrderPayment(pid);
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

  if (!open || !orderId) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6"
    >
      <button
        aria-label="ปิด"
        onClick={onClose}
        className="absolute inset-0 bg-brand-900/60 backdrop-blur-sm"
      />

      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-start justify-between">
          <div>
            <div className="text-xs text-brand-700/70 font-medium">ชำระเงินคำสั่งซื้อ</div>
            <div className="font-mono text-sm font-bold text-brand-800">{orderNumber}</div>
            <div className="text-xs text-brand-900/60 mt-0.5">{productName}</div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full text-brand-800 hover:bg-brand-50 flex items-center justify-center"
            aria-label="ปิด"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          {state === "succeeded" ? (
            <div className="text-center py-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-brand-600 text-white flex items-center justify-center text-3xl">✓</div>
              <h3 className="mt-4 text-lg font-bold text-brand-800">ชำระเงินสำเร็จ</h3>
              <p className="mt-2 text-sm text-brand-900/70">
                คำสั่งซื้อ <span className="font-mono font-semibold">{orderNumber}</span> ได้รับการยืนยันแล้ว
              </p>
              <button
                type="button"
                onClick={() => { onClose(); window.location.reload(); }}
                className="mt-6 rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2.5 text-sm transition"
              >
                รีเฟรชรายการ
              </button>
            </div>
          ) : state === "error" ? (
            <div className="text-center py-6">
              <div className="mx-auto w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-2xl">!</div>
              <h3 className="mt-4 text-lg font-bold text-brand-800">เกิดข้อผิดพลาด</h3>
              <p className="mt-2 text-sm text-red-700 break-words">{error}</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-6 rounded-full border border-border hover:bg-brand-50 text-brand-800 font-medium px-6 py-2.5 text-sm transition"
              >
                ปิด
              </button>
            </div>
          ) : state === "expired" ? (
            <div className="text-center py-6">
              <div className="mx-auto w-14 h-14 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-2xl">⏱</div>
              <h3 className="mt-4 text-lg font-bold text-brand-800">QR หมดอายุ</h3>
              <p className="mt-2 text-sm text-brand-900/70">ปิดหน้าต่างแล้วเปิดใหม่เพื่อสร้าง QR อีกครั้ง</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-6 rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2.5 text-sm transition"
              >
                ปิด
              </button>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-brand-100 p-4 bg-brand-50/40 text-center">
                <div className="text-xs text-brand-900/60">ชำระผ่าน PromptPay</div>
                <div className="text-3xl font-extrabold text-brand-800 mt-1">฿{amount.toLocaleString()}</div>
                <div className="mt-1 text-[11px] text-brand-900/55">ประมวลผลโดย Stripe</div>

                <div className="mt-4 mx-auto w-56 h-56 bg-white rounded-xl border border-border flex items-center justify-center overflow-hidden">
                  {state === "loading" ? (
                    <div className="text-xs text-brand-900/50 text-center px-4">
                      กำลังสร้าง QR...<br />
                      <span className="opacity-60">รอสักครู่ (5–10 วินาที)</span>
                    </div>
                  ) : qrUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrUrl} alt="PromptPay QR" className="w-full h-full" />
                  ) : (
                    <div className="text-xs text-brand-900/50">รอ QR...</div>
                  )}
                </div>

                <div className="mt-3 text-[11px] text-brand-900/55 leading-relaxed">
                  สแกนด้วยแอปธนาคาร • QR ใช้ได้ ~10 นาที
                </div>
              </div>

              <div className="mt-5 flex items-center justify-center gap-2 text-sm text-brand-700">
                <span className="relative flex w-2.5 h-2.5">
                  <span className="animate-ping absolute inset-0 rounded-full bg-brand-400 opacity-75" />
                  <span className="relative rounded-full w-2.5 h-2.5 bg-brand-500" />
                </span>
                {state === "processing" ? "กำลังยืนยันการชำระเงิน..." : "รอการชำระเงิน..."}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="mt-4 w-full rounded-xl border border-border hover:bg-brand-50 text-brand-800 font-medium py-2.5 transition"
              >
                ยกเลิก
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
