"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { computeDeviceStatus } from "@/lib/device-status";

const DeviceOnlineContext = createContext(true);

/** Sensor/WiFi values must not keep showing a stale reading once the
 * device has actually gone offline — poll last_seen/status the same 5s
 * cadence as the values themselves, and let consumers hide/blank out
 * via useDeviceOnline() instead of duplicating this poll per child. */
export function DeviceOnlineProvider({
  deviceId,
  initialOnline,
  children,
}: {
  deviceId: string;
  initialOnline: boolean;
  children: React.ReactNode;
}) {
  const [online, setOnline] = useState(initialOnline);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function poll() {
      const { data } = await supabase
        .from("iot_nodes")
        .select("status, last_seen")
        .eq("id", deviceId)
        .maybeSingle();
      if (cancelled || !data) return;
      setOnline(computeDeviceStatus(data.status, data.last_seen) === "online");
    }

    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [deviceId]);

  return <DeviceOnlineContext.Provider value={online}>{children}</DeviceOnlineContext.Provider>;
}

export function useDeviceOnline(): boolean {
  return useContext(DeviceOnlineContext);
}
