"use client";

import { deletePlanOrder } from "../actions";

export function DeletePlanOrderButton({
  orderId,
  orderLabel,
}: {
  orderId: string;
  orderLabel: string;
}) {
  return (
    <form
      action={deletePlanOrder.bind(null, orderId)}
      className="mt-3 flex justify-end"
      onSubmit={(e) => {
        if (
          !confirm(
            `ลบคำสั่งซื้อแพ็กเกจ ${orderLabel} ทิ้งถาวร?\n\nการลบไม่สามารถย้อนกลับได้ (จะไม่กระทบสถานะแพ็กเกจของผู้ใช้)`
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-700 font-medium px-3 py-1.5 text-xs transition"
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        </svg>
        ลบรายการ
      </button>
    </form>
  );
}
