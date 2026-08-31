"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { renewStarterFree } from "../actions";

export function RenewStarterButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setMsg(null);
          start(async () => {
            const r = await renewStarterFree();
            if (r.ok) {
              setMsg({ ok: true, text: "ต่ออายุสำเร็จ! ใช้งานได้อีก 1 ปี" });
              router.refresh();
            } else {
              setMsg({ ok: false, text: r.error });
            }
          });
        }}
        className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 text-sm transition disabled:opacity-60"
      >
        {pending ? "กำลังต่ออายุ..." : "ต่ออายุฟรี 1 ปี"}
      </button>
      {msg && (
        <div className={`mt-2 text-xs ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</div>
      )}
    </div>
  );
}
