"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/admin/current";
import { logAdminAction } from "@/lib/admin/audit";
import { restartBridge } from "@/lib/admin/mqtt-webhook";

export async function restartBridgeAction(): Promise<{ ok: boolean; error?: string }> {
  const session = await requireModule("mqtt");
  const result = await restartBridge();
  await logAdminAction(
    session,
    "mqtt_bridge_restart",
    "smf-mqtt-bridge-prod",
    result.ok ? "success" : "failure",
    result.ok ? undefined : result.error
  );
  revalidatePath("/admin/mqtt/bridge");
  revalidatePath("/admin/mqtt");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
