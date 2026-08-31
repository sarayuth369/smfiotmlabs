"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { WifiSignalIcon } from "@/app/_components/WifiSignalIcon";

/**
 * Polls iot_nodes.rssi every 5s — same cadence/pattern as LiveSensorValue
 * polling sensor_readings_latest. Initial value hydrated from server props.
 */
export function LiveWifiSignal({
  deviceId,
  initialRssi,
}: {
  deviceId: string;
  initialRssi: number | null;
}) {
  const [rssi, setRssi] = useState<number | null>(initialRssi);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function fetchLatest() {
      const { data } = await supabase
        .from("iot_nodes")
        .select("rssi")
        .eq("id", deviceId)
        .maybeSingle();
      if (cancelled || !data) return;
      setRssi(data.rssi as number | null);
    }

    const interval = setInterval(fetchLatest, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [deviceId]);

  if (rssi == null) return <>-</>;
  return (
    <span className="inline-flex items-center gap-1">
      <WifiSignalIcon />
      {rssi} dBm
    </span>
  );
}
