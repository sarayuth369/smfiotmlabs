"use client";

import { useEffect, useRef, useState } from "react";
import { PLAN_INFO } from "@/lib/plans";
import { createStripePromptPay, pollStripePayment } from "../actions";

type Plan = "pro" | "business";
type State = "select" | "loading" | "waiting" | "processing" | "succeeded" | "expired" | "error";

const MONTHS_OPTIONS = [1, 2, 3, 6, 12];

export function UpgradeModal({
  open,
  plan,
  onClose,
}: {
  open: boolean;
  plan: Plan | null;
  onClose: () => void;
}) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [pid, setPid] = useState<string | null>(null);
  const [state, setState] = useState<State>("select");
  const [error, setError] = useState<string | null>(null);
  const [months, setMonths] = useState<number>(1);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset when modal opens/closes
  useEffect(() => {
    if (!open || !plan) return;

    setState("select");
    setError(null);
    setQrUrl(null);
    setPid(null);
    setMonths(1);

    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, plan, onClose]);

  // Poll while waiting
  useEffect(() => {
    if (!pid || state === "succeeded" || state === "error" || state === "expired") {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    pollingRef.current = setInterval(async () => {
      const res = await pollStripePayment(pid);
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

  async function startPayment() {
    if (!plan) return;
    setState("loading");
    setError(null);
    const res = await createStripePromptPay(plan, months);
    if (!res.ok) {
      setState("error");
      setError(res.error);
      return;
    }
    setQrUrl(res.qrImageUrl);
    setPid(res.paymentIntentId);
    setState("waiting");
  }

  if (!open || !plan) return null;
  const info = PLAN_INFO[plan];
  const total = info.price * months;

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
            <div className="text-xs text-brand-700/70 font-medium">อัปเกรด / ต่ออายุ</div>
            <div className="text-lg font-bold text-brand-800">SMF IoT {info.name}</div>
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
              <div className="mx-auto w-16 h-16 rounded-full bg-brand-600 text-white flex items-center justify-center text-3xl">
                ✓
              </div>
              <h3 className="mt-4 text-lg font-bold text-brand-800">ชำระเงินสำเร็จ</h3>
              <p className="mt-2 text-sm text-brand-900/70">
                บัญชีของคุณอัปเกรดเป็นแพ็กเกจ{" "}
                <span className="font-semibold">{info.name}</span>{" "}
                <span className="font-semibold">{months} เดือน</span> เรียบร้อยแล้ว
              </p>
              <a
                href="/dashboard"
                className="mt-6 inline-flex rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2.5 text-sm transition"
              >
                ไปยัง Dashboard
              </a>
            </div>
          ) : state === "error" ? (
            <div className="text-center py-6">
              <div className="mx-auto w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-2xl">
                !
              </div>
              <h3 className="mt-4 text-lg font-bold text-brand-800">เกิดข้อผิดพลาด</h3>
              <p className="mt-2 text-sm text-red-700 break-words">{error}</p>
              <button
                type="button"
                onClick={() => setState("select")}
                className="mt-6 rounded-full border border-border hover:bg-brand-50 text-brand-800 font-medium px-6 py-2.5 text-sm transition"
              >
                กลับไปเลือกใหม่
              </button>
            </div>
          ) : state === "expired" ? (
            <div className="text-center py-6">
              <div className="mx-auto w-14 h-14 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-2xl">
                ⏱
              </div>
              <h3 className="mt-4 text-lg font-bold text-brand-800">QR หมดอายุ</h3>
              <p className="mt-2 text-sm text-brand-900/70">
                กรุณาปิดหน้าต่างนี้แล้วเริ่มใหม่อีกครั้ง
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-6 rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2.5 text-sm transition"
              >
                ปิด
              </button>
            </div>
          ) : state === "select" ? (
            <>
              <div className="rounded-2xl border border-brand-100 bg-brand-50/40 p-4">
                <div className="text-xs text-brand-900/60">ราคา</div>
                <div className="text-base font-semibold text-brand-800">
                  ฿{info.price.toLocaleString()} <span className="text-xs font-normal text-brand-900/60">/ เดือน</span>
                </div>
              </div>

              <div className="mt-5">
                <label className="block text-sm font-semibold text-brand-900/85 mb-2">
                  ระยะเวลา (เดือน)
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {MONTHS_OPTIONS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMonths(m)}
                      className={`rounded-lg border py-2 text-sm font-semibold transition ${
                        months === m
                          ? "bg-brand-600 text-white border-brand-600"
                          : "bg-white text-brand-800 border-border hover:border-brand-400"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <div className="mt-3">
                  <label className="text-xs text-brand-900/60">หรือกำหนดเอง (1–12 เดือน):</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={months}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v)) setMonths(Math.max(1, Math.min(12, v)));
                    }}
                    className="ml-2 w-20 rounded-lg border border-border px-2 py-1 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
              </div>

              <div className="mt-5 rounded-xl bg-brand-800 text-white p-4 flex items-baseline justify-between">
                <div>
                  <div className="text-xs opacity-70">ยอดชำระรวม</div>
                  <div className="text-xs opacity-60 mt-0.5">
                    ฿{info.price.toLocaleString()} × {months} เดือน
                  </div>
                </div>
                <div className="text-3xl font-extrabold">฿{total.toLocaleString()}</div>
              </div>

              <button
                type="button"
                onClick={startPayment}
                className="mt-5 w-full rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3 transition"
              >
                ดำเนินการชำระเงิน (PromptPay)
              </button>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 w-full rounded-xl border border-border hover:bg-brand-50 text-brand-800 font-medium py-2.5 transition"
              >
                ยกเลิก
              </button>
            </>
          ) : (
            <>
              <div className="rounded-2xl border border-brand-100 p-4 bg-brand-50/40 text-center">
                <div className="text-xs text-brand-900/60">ชำระผ่าน PromptPay</div>
                <div className="text-3xl font-extrabold text-brand-800 mt-1">
                  ฿{total.toLocaleString()}
                </div>
                <div className="mt-1 text-[11px] text-brand-900/55">
                  {info.name} × {months} เดือน • ประมวลผลโดย Stripe
                </div>

                <div className="mt-4 mx-auto w-56 h-56 bg-white rounded-xl border border-border flex items-center justify-center overflow-hidden">
                  {state === "loading" ? (
                    <div className="text-xs text-brand-900/50">กำลังสร้าง QR...</div>
                  ) : qrUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrUrl} alt="PromptPay QR" className="w-full h-full" />
                  ) : null}
                </div>

                <div className="mt-3 text-[11px] text-brand-900/55 leading-relaxed">
                  สแกนด้วยแอปธนาคาร / mobile banking
                  <br />QR ใช้ได้ประมาณ 10 นาที
                </div>
              </div>

              <div className="mt-5 flex items-center justify-center gap-2 text-sm text-brand-700">
                <span className="relative flex w-2.5 h-2.5">
                  <span className="animate-ping absolute inset-0 rounded-full bg-brand-400 opacity-75" />
                  <span className="relative rounded-full w-2.5 h-2.5 bg-brand-500" />
                </span>
                {state === "processing"
                  ? "กำลังยืนยันการชำระเงิน..."
                  : "รอการชำระเงิน — ระบบจะอัปเกรดอัตโนมัติเมื่อได้รับเงิน"}
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
