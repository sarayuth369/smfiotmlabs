"use client";

import { useEffect, useState } from "react";
import { computeDeviceStatus } from "@/lib/device-status";
import { WifiSignalIcon } from "@/app/_components/WifiSignalIcon";

const STATUS_CLS: Record<"online" | "offline" | "warning" | "never_connected", string> = {
  online: "bg-green-100 text-green-800",
  offline: "bg-brand-100 text-brand-700/70",
  warning: "bg-amber-100 text-amber-800",
  never_connected: "bg-brand-100 text-brand-700/50",
};

/**
 * Status badge + WiFi cell for one table row, polling every 5s — same
 * cadence as LiveSensorValue on the device detail page. Replaces the
 * server-rendered snapshot (which never changes again after the page
 * load) so a device going offline or its signal changing reflects
 * without a manual refresh.
 */
export function LiveDeviceCells({
  deviceId,
  isDisabled,
  isArchived,
  initialStatus,
  initialRssi,
  initialLastSeen,
}: {
  deviceId: string;
  isDisabled: boolean;
  isArchived: boolean;
  initialStatus: string;
  initialRssi: number | null;
  initialLastSeen: string | null;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [rssi, setRssi] = useState<number | null>(initialRssi);
  const [lastSeen, setLastSeen] = useState<string | null>(initialLastSeen);

  useEffect(() => {
    if (isDisabled || isArchived) return; // those badges are static, no point polling
    let cancelled = false;
    async function poll() {
      const res = await fetch(`/api/admin/devices/${deviceId}/live`, { cache: "no-store" });
      if (cancelled || !res.ok) return;
      const j = await res.json();
      if (!j.ok) return;
      setStatus(j.status);
      setRssi(j.rssi);
      setLastSeen(j.last_seen);
    }
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [deviceId, isDisabled, isArchived]);

  if (isDisabled) {
    return (
      <>
        <td className="px-4 py-3">
          <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-red-100 text-red-800">Disabled</span>
        </td>
        <td className="px-4 py-3 text-brand-900/70 text-xs">-</td>
      </>
    );
  }
  if (isArchived) {
    return (
      <>
        <td className="px-4 py-3">
          <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">Archived</span>
        </td>
        <td className="px-4 py-3 text-brand-900/70 text-xs">-</td>
      </>
    );
  }

  const effective = computeDeviceStatus(status, lastSeen);
  return (
    <>
      <td className="px-4 py-3">
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${STATUS_CLS[effective]}`}>
          {effective}
        </span>
      </td>
      <td className="px-4 py-3 text-brand-900/70 text-xs">
        {effective === "online" && rssi != null ? (
          <span className="inline-flex items-center gap-1">
            <WifiSignalIcon />
            {rssi} dBm
          </span>
        ) : (
          "-"
        )}
      </td>
    </>
  );
}
