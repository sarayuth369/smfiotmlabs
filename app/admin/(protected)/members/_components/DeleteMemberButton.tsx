"use client";

import { deleteMember } from "../actions";

export function DeleteMemberButton({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  return (
    <form
      action={deleteMember.bind(null, userId)}
      onSubmit={(e) => {
        if (
          !confirm(
            `ลบสมาชิก ${email} ทิ้งถาวร?\n\nจะลบบัญชี auth.users + profile + ข้อมูลที่ผูก (payment_requests, hardware_orders, notifications) ทั้งหมดตาม cascade\n\nไม่สามารถย้อนกลับได้`
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="inline-flex items-center gap-1 rounded-lg border border-red-200 hover:bg-red-50 text-red-700 font-medium px-2.5 py-1 text-[11px] transition"
      >
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        </svg>
        ลบ
      </button>
    </form>
  );
}
