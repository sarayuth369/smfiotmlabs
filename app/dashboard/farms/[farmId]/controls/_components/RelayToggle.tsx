"use client";

import { useState, useTransition } from "react";
import { toggleRelay } from "../actions";

export function RelayToggle({
  deviceId,
  channel,
  initialState,
}: {
  deviceId: string;
  channel: number;
  initialState: boolean | null;
}) {
  const [state, setState] = useState<boolean | null>(initialState);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const desired = !(state ?? false);
    setState(desired); // optimistic — same pattern as the Flutter app
    setError(null);
    startTransition(async () => {
      const r = await toggleRelay(deviceId, channel, desired);
      if (!r.ok) {
        setState(!desired); // revert on failure
        setError(r.error ?? "ส่งคำสั่งไม่สำเร็จ");
      }
    });
  }

  const on = state ?? false;
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={`relative inline-flex h-7 w-12 items-center rounded-full transition disabled:opacity-50 ${
          on ? "bg-green-500" : "bg-brand-200"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
            on ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
      <span className={`text-xs font-bold ${on ? "text-green-700" : "text-brand-900/50"}`}>
        {on ? "เปิด" : "ปิด"}
      </span>
      {state === null && !pending && (
        <span className="text-[10px] text-brand-900/40">(ยังไม่มีรายงานจากอุปกรณ์)</span>
      )}
      {error && <span className="text-[10px] text-red-700">{error}</span>}
    </div>
  );
}
