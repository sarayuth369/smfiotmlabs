"use client";

import { suspendMember, unsuspendMember } from "../actions";

/**
 * Renders a submit button that overrides its parent form's action via `formAction`.
 * Do NOT wrap in a <form> — the parent already provides one, and nested <form> is invalid HTML.
 */
export function SuspendMemberButton({ userId, suspended }: { userId: string; suspended: boolean }) {
  if (suspended) {
    return (
      <button
        type="submit"
        formAction={unsuspendMember.bind(null, userId)}
        formNoValidate
        onClick={(e) => {
          if (
            !confirm(
              "คุณต้องการปลดระงับบัญชีนี้หรือไม่?\nผู้ใช้จะสามารถเข้าสู่ระบบและกลับมาใช้งานอุปกรณ์ได้ตามปกติ"
            )
          ) {
            e.preventDefault();
          }
        }}
        className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 hover:bg-emerald-50 text-emerald-700 font-medium px-2.5 py-1 text-[11px] transition"
      >
        ปลดระงับบัญชี
      </button>
    );
  }

  return (
    <button
      type="submit"
      formAction={suspendMember.bind(null, userId)}
      formNoValidate
      onClick={(e) => {
        if (
          !confirm(
            "คุณต้องการระงับบัญชีนี้หรือไม่?\nผู้ใช้จะไม่สามารถเข้าสู่ระบบ และอุปกรณ์ทั้งหมดจะหยุดส่งข้อมูลเข้าสู่ระบบชั่วคราว"
          )
        ) {
          e.preventDefault();
        }
      }}
      className="inline-flex items-center gap-1 rounded-lg border border-amber-200 hover:bg-amber-50 text-amber-700 font-medium px-2.5 py-1 text-[11px] transition"
    >
      ระงับบัญชี
    </button>
  );
}
