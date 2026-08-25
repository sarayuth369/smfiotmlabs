"use client";

import { useState, useTransition } from "react";
import { restartBridgeAction } from "../actions";

export function RestartButton() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function doRestart() {
    if (
      !confirm(
        "Restart smf-mqtt-bridge-prod?\n\nTelemetry ingest จะหยุดชั่วคราว (~10 วินาที) ระหว่าง restart\nESP32/Flutter จะ auto-reconnect เอง ไม่กระทบ device credentials"
      )
    )
      return;
    setMsg(null);
    startTransition(async () => {
      const r = await restartBridgeAction();
      setMsg(r.ok ? "✓ Restart สำเร็จ" : "✗ ล้มเหลว: " + r.error);
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={doRestart}
        disabled={pending}
        className="rounded-full border border-red-200 hover:bg-red-50 text-red-700 text-sm font-semibold px-4 py-2 transition disabled:opacity-50"
      >
        {pending ? "กำลัง Restart..." : "🔄 Restart Bridge"}
      </button>
      {msg && <div className="mt-2 text-xs text-brand-900/70">{msg}</div>}
    </div>
  );
}
