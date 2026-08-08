"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { buildPromptPayPayload, PROMPTPAY_ID, PROMPTPAY_NAME } from "@/lib/promptpay";
import { PLAN_INFO } from "@/lib/plans";
import { requestUpgrade } from "../actions";

type Plan = "pro" | "business";

export function UpgradeModal({
  open,
  plan,
  onClose,
}: {
  open: boolean;
  plan: Plan | null;
  onClose: () => void;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open || !plan) return;
    setError(null);
    setDone(false);
    const amount = PLAN_INFO[plan].price;
    const payload = buildPromptPayPayload(PROMPTPAY_ID, amount);
    QRCode.toDataURL(payload, { width: 320, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setError("สร้าง QR ไม่สำเร็จ"));

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

  if (!open || !plan) return null;

  const info = PLAN_INFO[plan];

  async function confirmPaid() {
    if (!plan) return;
    setLoading(true);
    setError(null);
    const res = await requestUpgrade(plan);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(true);
  }

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
            <div className="text-xs text-brand-700/70 font-medium">อัปเกรดแพ็กเกจ</div>
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
          {done ? (
            <div className="text-center py-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-brand-600 text-white flex items-center justify-center text-3xl">
                ✓
              </div>
              <h3 className="mt-4 text-lg font-bold text-brand-800">อัปเกรดสำเร็จ</h3>
              <p className="mt-2 text-sm text-brand-900/70">
                บัญชีของคุณเป็นแพ็กเกจ <span className="font-semibold">{info.name}</span> แล้ว
                <br />ระบบได้รับแจ้งการชำระเงิน — หากมีปัญหาทีมงานจะติดต่อกลับ
              </p>
              <a
                href="/dashboard"
                className="mt-6 inline-flex rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2.5 text-sm transition"
              >
                ไปยัง Dashboard
              </a>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-brand-100 p-4 bg-brand-50/40 text-center">
                <div className="text-xs text-brand-900/60">ชำระผ่าน PromptPay</div>
                <div className="text-3xl font-extrabold text-brand-800 mt-1">
                  ฿{info.price.toLocaleString()}
                </div>
                <div className="mt-1 text-xs text-brand-900/60">
                  ผู้รับ: {PROMPTPAY_NAME} • {PROMPTPAY_ID}
                </div>

                <div className="mt-4 mx-auto w-56 h-56 bg-white rounded-xl border border-border flex items-center justify-center overflow-hidden">
                  {qrDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrDataUrl} alt="PromptPay QR" className="w-full h-full" />
                  ) : (
                    <div className="text-xs text-brand-900/50">กำลังสร้าง QR...</div>
                  )}
                </div>

                <div className="mt-3 text-[11px] text-brand-900/55 leading-relaxed">
                  สแกนด้วยแอปธนาคาร / mobile banking<br />
                  ตรวจสอบยอดและชื่อผู้รับให้ตรงก่อนโอน
                </div>
              </div>

              {error && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </div>
              )}

              <div className="mt-5 space-y-2">
                <button
                  type="button"
                  onClick={confirmPaid}
                  disabled={loading}
                  className="w-full rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-70 text-white font-semibold py-3 transition"
                >
                  {loading ? "กำลังบันทึก..." : "ฉันชำระเงินแล้ว"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-xl border border-border hover:bg-brand-50 text-brand-800 font-medium py-2.5 transition"
                >
                  ยกเลิก
                </button>
              </div>

              <p className="mt-4 text-[11px] text-brand-900/50 text-center">
                * โหมด Demo — ระบบจะอัปเกรดทันทีหลังกด &quot;ฉันชำระเงินแล้ว&quot; และบันทึกรายการเข้าคิวตรวจสอบ
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
