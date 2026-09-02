"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendAdminDeviceCommand } from "../actions";
import { ADMIN_COMMAND_LABEL, type AdminCommandType } from "@/lib/device-commands";

const CONFIRM_MESSAGE: Partial<Record<AdminCommandType, string>> = {
  restart_mqtt: "รีสตาร์ท MQTT ของอุปกรณ์นี้หรือไม่? อุปกรณ์จะตัดการเชื่อมต่อ MQTT ชั่วครู่แล้วเชื่อมต่อใหม่ (WiFi และการทำงานอื่นไม่กระทบ)",
  reboot_device: "รีบูตอุปกรณ์นี้หรือไม่? อุปกรณ์จะออฟไลน์ชั่วครู่ระหว่างบูตใหม่",
};

const DIAGNOSTIC_TYPES: AdminCommandType[] = ["get_status", "run_diagnostics", "test_sensors"];
const REMOTE_ACTION_TYPES: AdminCommandType[] = ["restart_mqtt", "reboot_device"];

export function RemoteCommandPanel({ deviceId }: { deviceId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pendingType, setPendingType] = useState<AdminCommandType | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function send(commandType: AdminCommandType) {
    const confirmMsg = CONFIRM_MESSAGE[commandType];
    if (confirmMsg && !confirm(confirmMsg)) return;

    setMsg(null);
    setPendingType(commandType);
    start(async () => {
      const r = await sendAdminDeviceCommand(deviceId, commandType);
      setMsg(
        r.ok
          ? { ok: true, text: `ส่งคำสั่ง "${ADMIN_COMMAND_LABEL[commandType]}" แล้ว — ดูผลที่ Command History ด้านล่าง` }
          : { ok: false, text: r.error }
      );
      setPendingType(null);
      router.refresh();
    });
  }

  const btnCls = (busy: boolean) =>
    `inline-flex items-center gap-1.5 rounded-lg border border-brand-200 hover:border-brand-400 text-brand-800 font-medium px-3 py-2 text-sm transition disabled:opacity-50 disabled:cursor-not-allowed ${busy ? "opacity-60" : ""}`;

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-brand-900/60 mb-2">Diagnostics</div>
        <div className="flex flex-wrap gap-2">
          {DIAGNOSTIC_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              disabled={pending}
              onClick={() => send(t)}
              className={btnCls(pending && pendingType === t)}
            >
              {pending && pendingType === t ? "กำลังส่ง..." : ADMIN_COMMAND_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-brand-900/60 mb-2">Remote Actions</div>
        <div className="flex flex-wrap gap-2">
          {REMOTE_ACTION_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              disabled={pending}
              onClick={() => send(t)}
              className={`${btnCls(pending && pendingType === t)} border-amber-200 hover:border-amber-400 text-amber-800`}
            >
              {pending && pendingType === t ? "กำลังส่ง..." : ADMIN_COMMAND_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      {msg && (
        <div className={`text-xs rounded-lg px-3 py-2 ${msg.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
