"use client";

import { useEffect, useRef, useState } from "react";
import { effectiveCommandStatus, ADMIN_COMMAND_LABEL, type AdminCommandType } from "@/lib/device-commands";

export type DeviceCommand = {
  id: string;
  command: string;
  status: string;
  requested_by: string | null;
  user_id: string | null;
  result: Record<string, unknown> | null;
  error_message: string | null;
  requested_at: string;
  completed_at: string | null;
};

const CMD_STATUS_CLS: Record<string, string> = {
  pending: "bg-brand-100 text-brand-700",
  sent: "bg-blue-100 text-blue-800",
  acknowledged: "bg-blue-100 text-blue-800",
  running: "bg-blue-100 text-blue-800",
  success: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  timeout: "bg-red-100 text-red-800",
};

const NON_TERMINAL = new Set(["pending", "sent", "acknowledged", "running"]);

function formatThai(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Live-polls every 2s while any row is still non-terminal — same idea as
 * LiveOtaHistory. Sending a command from RemoteCommandPanel also calls
 * router.refresh(), but that races the command's own MQTT round trip, so
 * this table needs its own polling to actually catch the status change.
 */
export function LiveCommandHistory({ deviceId, initialCommands }: { deviceId: string; initialCommands: DeviceCommand[] }) {
  const [commands, setCommands] = useState(initialCommands);
  const commandsRef = useRef(commands);
  const [debugLine, setDebugLine] = useState(`mounted with ${initialCommands.length} initial rows`);

  useEffect(() => {
    commandsRef.current = commands;
  }, [commands]);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function poll() {
      const stillWaiting = commandsRef.current.some((c) =>
        NON_TERMINAL.has(effectiveCommandStatus(c.command, c.status, c.requested_at))
      );
      if (commandsRef.current.length > 0 && !stillWaiting) {
        if (interval) clearInterval(interval);
        setDebugLine(`stopped polling — all ${commandsRef.current.length} rows terminal`);
        return;
      }
      let res: Response;
      try {
        res = await fetch(`/api/admin/devices/${deviceId}/commands`, { cache: "no-store" });
      } catch (e) {
        setDebugLine(`fetch threw: ${(e as Error).message}`);
        return;
      }
      if (cancelled) return;
      if (!res.ok) {
        setDebugLine(`fetch not ok: HTTP ${res.status}`);
        return;
      }
      const j = await res.json();
      if (!j.ok) {
        setDebugLine(`api returned ok:false — ${j.error ?? "no error field"}`);
        return;
      }
      setDebugLine(`polled at ${new Date().toLocaleTimeString("th-TH")} — got ${j.commands.length} rows`);
      setCommands(j.commands);
    }

    interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [deviceId]);

  if (commands.length === 0) {
    return (
      <div>
        <div className="text-sm text-brand-900/50">ยังไม่มีคำสั่งที่ส่งไปยังอุปกรณ์นี้</div>
        <div className="mt-2 text-[10px] text-brand-900/40 font-mono">TEMP DEBUG: {debugLine}</div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="mb-2 text-[10px] text-brand-900/40 font-mono">TEMP DEBUG: {debugLine}</div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-brand-800/70 border-b border-brand-100">
            <th className="py-2 pr-3">Command</th>
            <th className="py-2 pr-3">Requested By</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2 pr-3">Requested</th>
            <th className="py-2 pr-3">Completed</th>
            <th className="py-2 pr-3">Result</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-50">
          {commands.map((c) => {
            const status = effectiveCommandStatus(c.command, c.status, c.requested_at);
            const label = ADMIN_COMMAND_LABEL[c.command as AdminCommandType] ?? c.command;
            return (
              <tr key={c.id}>
                <td className="py-2 pr-3 font-semibold text-brand-800">{label}</td>
                <td className="py-2 pr-3 text-brand-900/70">{c.requested_by ?? (c.user_id ? "user" : "-")}</td>
                <td className="py-2 pr-3">
                  <span className={`font-bold uppercase px-2 py-0.5 rounded-full ${CMD_STATUS_CLS[status] ?? "bg-brand-100 text-brand-700"}`}>
                    {status}
                  </span>
                </td>
                <td className="py-2 pr-3 text-brand-900/60">{formatThai(c.requested_at)}</td>
                <td className="py-2 pr-3 text-brand-900/60">{c.completed_at ? formatThai(c.completed_at) : "-"}</td>
                <td className="py-2 pr-3 text-brand-900/70 max-w-[320px]">
                  {c.error_message ? (
                    <span className="text-red-700">{c.error_message}</span>
                  ) : c.result ? (
                    <details>
                      <summary className="cursor-pointer text-brand-700 hover:underline">ดูผลลัพธ์</summary>
                      <pre className="mt-1 whitespace-pre-wrap break-all text-[10px] bg-brand-50/60 rounded-lg p-2">
                        {JSON.stringify(c.result, null, 2)}
                      </pre>
                    </details>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
