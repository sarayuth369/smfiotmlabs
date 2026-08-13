"use client";

import { useState } from "react";
import { PayModal } from "./PayModal";

export function PayButton({
  orderId,
  orderNumber,
  productName,
  amount,
}: {
  orderId: string;
  orderNumber: string;
  productName: string;
  amount: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold uppercase tracking-wider px-4 py-2 transition"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <path d="M2 10h20" />
        </svg>
        ชำระเงิน
      </button>
      <PayModal
        open={open}
        orderId={open ? orderId : null}
        orderNumber={orderNumber}
        productName={productName}
        amount={amount}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
