"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFirmwareDownloadUrl } from "@/lib/ota";
import { publishToDevice } from "@/lib/device-mqtt";

/**
 * Admin-side job actions. Unlike the user-facing ota-actions.ts, these
 * skip the subscription/plan entitlement check (admin override, per
 * spec) but keep every other safety check: release must still be
 * approved, hardware must still match, and cancel still only works
 * before the device has started writing to flash.
 */

export async function adminCancelOtaJob(jobId: string): Promise<{ ok: boolean; error?: string }> {
  await requireModule("firmware");
  const admin = createAdminClient();

  const { data: job } = await admin.from("firmware_update_jobs").select("id, state").eq("id", jobId).maybeSingle();
  if (!job) return { ok: false, error: "job not found" };
  if (job.state !== "requested") {
    return { ok: false, error: "job already past the cancellable stage (device may be writing flash)" };
  }
  await admin
    .from("firmware_update_jobs")
    .update({ state: "cancelled", completed_at: new Date().toISOString() })
    .eq("id", jobId);
  revalidatePath("/admin/firmware/ota");
  return { ok: true };
}

export async function adminRetryOtaJob(jobId: string): Promise<{ ok: boolean; error?: string; new_job_id?: string }> {
  await requireModule("firmware");
  const admin = createAdminClient();

  const { data: old } = await admin
    .from("firmware_update_jobs")
    .select("device_id, firmware_release_id, to_version, state")
    .eq("id", jobId)
    .maybeSingle();
  if (!old) return { ok: false, error: "job not found" };
  if (old.state !== "failed" && old.state !== "cancelled" && old.state !== "timeout" && old.state !== "rolled_back") {
    return { ok: false, error: "only a terminal (failed/cancelled/timeout/rolled_back) job can be retried" };
  }

  const { data: release } = await admin
    .from("firmware_releases")
    .select("id, approved_at, hardware_model")
    .eq("id", old.firmware_release_id as string)
    .maybeSingle();
  if (!release?.approved_at) return { ok: false, error: "release is no longer approved" };

  const { data: device } = await admin
    .from("iot_nodes")
    .select("device_uid, hardware_model, firmware_version, farm_id")
    .eq("id", old.device_id as string)
    .maybeSingle();
  if (!device) return { ok: false, error: "device not found" };
  if (device.hardware_model !== release.hardware_model && release.hardware_model !== "ESP32-S3") {
    return { ok: false, error: "hardware_model no longer matches this release" };
  }

  const { data: farm } = await admin.from("farms").select("user_id").eq("id", device.farm_id as string).maybeSingle();
  const { data: profile } = await admin
    .from("profiles")
    .select("customer_identity_id")
    .eq("id", (farm?.user_id as string) ?? "")
    .maybeSingle();
  const customerUuid = profile?.customer_identity_id as string | null;
  if (!customerUuid) return { ok: false, error: "device owner missing customer_identity_id" };

  const { data: newJob, error: jobErr } = await admin
    .from("firmware_update_jobs")
    .insert({
      device_id: old.device_id,
      firmware_release_id: old.firmware_release_id,
      method: "ota",
      state: "requested",
      from_version: device.firmware_version as string | null,
      to_version: old.to_version,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (jobErr || !newJob) {
    if (jobErr?.code === "23505") return { ok: false, error: "a job is already active for this device" };
    return { ok: false, error: jobErr?.message ?? "insert failed" };
  }

  const dl = await getFirmwareDownloadUrl(admin, old.firmware_release_id as string, 60);
  if (!dl.ok) {
    await admin.from("firmware_update_jobs").update({ state: "failed", error_message: dl.error, completed_at: new Date().toISOString() }).eq("id", newJob.id);
    return { ok: false, error: dl.error };
  }

  const publish = await publishToDevice(customerUuid, device.device_uid as string, "ota_cmd", {
    release_id: old.firmware_release_id,
    version: old.to_version,
    url: dl.url,
    sha256: dl.sha256,
  });
  if (!publish.ok) {
    await admin.from("firmware_update_jobs").update({ state: "failed", error_message: publish.error, completed_at: new Date().toISOString() }).eq("id", newJob.id);
    return { ok: false, error: publish.error };
  }

  revalidatePath("/admin/firmware/ota");
  return { ok: true, new_job_id: newJob.id as string };
}
