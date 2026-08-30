"use server";

/**
 * User-facing OTA actions for one device. Every action re-validates
 * ownership + subscription eligibility server-side via
 * lib/ota.ts's resolveOtaEligibility() — the client-shown "eligible"
 * state from a previous read is NEVER trusted for the actual write.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveOtaEligibility, getFirmwareDownloadUrl, type OtaEligibility } from "@/lib/ota";
import { publishToDevice } from "@/lib/device-mqtt";

export type OtaJobRow = {
  id: string;
  state: string;
  progress: number | null;
  from_version: string | null;
  to_version: string;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");
  return user;
}

export async function checkOtaAvailability(deviceId: string): Promise<OtaEligibility> {
  const user = await requireUser();
  const admin = createAdminClient();
  return resolveOtaEligibility(admin, user.id, deviceId);
}

export async function getLatestOtaJob(deviceId: string): Promise<OtaJobRow | null> {
  const user = await requireUser();
  const admin = createAdminClient();

  // Ownership check — same pattern as resolveOtaEligibility.
  const { data: device } = await admin.from("iot_nodes").select("farm_id").eq("id", deviceId).maybeSingle();
  if (!device) return null;
  const { data: farm } = await admin.from("farms").select("user_id").eq("id", device.farm_id as string).maybeSingle();
  if (!farm || farm.user_id !== user.id) return null;

  const { data } = await admin
    .from("firmware_update_jobs")
    .select("id, state, progress, from_version, to_version, error_message, created_at, completed_at")
    .eq("device_id", deviceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as OtaJobRow | null) ?? null;
}

export type RequestOtaResult = { ok: true; job_id: string } | { ok: false; error: string };

export async function requestOtaUpdate(deviceId: string): Promise<RequestOtaResult> {
  const user = await requireUser();
  const admin = createAdminClient();

  const eligibility = await resolveOtaEligibility(admin, user.id, deviceId);
  if (!eligibility.eligible) {
    return { ok: false, error: `not eligible: ${eligibility.reason}` };
  }

  const { data: device } = await admin
    .from("iot_nodes")
    .select("device_uid, firmware_version, farm_id")
    .eq("id", deviceId)
    .maybeSingle();
  if (!device) return { ok: false, error: "device not found" };

  const { data: farm } = await admin.from("farms").select("user_id").eq("id", device.farm_id as string).maybeSingle();
  const { data: profile } = await admin
    .from("profiles")
    .select("customer_identity_id")
    .eq("id", (farm?.user_id as string) ?? user.id)
    .maybeSingle();
  const customerUuid = profile?.customer_identity_id as string | null;
  if (!customerUuid) return { ok: false, error: "missing customer_identity_id" };

  const { data: job, error: jobErr } = await admin
    .from("firmware_update_jobs")
    .insert({
      device_id: deviceId,
      firmware_release_id: eligibility.release.id,
      requested_by: user.id,
      method: "ota",
      state: "requested",
      from_version: device.firmware_version as string | null,
      to_version: eligibility.release.version,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (jobErr || !job) {
    // 23505 = the partial UNIQUE index caught a job already in flight for this device
    if (jobErr?.code === "23505") return { ok: false, error: "an OTA job is already in progress for this device" };
    return { ok: false, error: `job insert failed: ${jobErr?.message ?? "unknown"}` };
  }

  const dl = await getFirmwareDownloadUrl(admin, eligibility.release.id, 60);
  if (!dl.ok) {
    await admin
      .from("firmware_update_jobs")
      .update({ state: "failed", error_message: `download_url: ${dl.error}`, completed_at: new Date().toISOString() })
      .eq("id", job.id);
    return { ok: false, error: dl.error };
  }

  const publish = await publishToDevice(customerUuid, device.device_uid as string, "ota_cmd", {
    release_id: eligibility.release.id,
    version: eligibility.release.version,
    url: dl.url,
    sha256: dl.sha256,
  });
  if (!publish.ok) {
    await admin
      .from("firmware_update_jobs")
      .update({ state: "failed", error_message: `publish: ${publish.error}`, completed_at: new Date().toISOString() })
      .eq("id", job.id);
    return { ok: false, error: `could not reach device: ${publish.error}` };
  }

  revalidatePath(`/dashboard/devices/${deviceId}`);
  return { ok: true, job_id: job.id as string };
}

/**
 * Only safe before the device has started writing to flash — once a job
 * is past 'requested' (device has acknowledged with downloading/
 * verifying/installing), there is no cancel command in the firmware and
 * interrupting mid-write risks a corrupted partition. This matches the
 * spec's "do not allow dangerous cancellation during a critical write
 * stage" requirement by construction, not by a race-prone check.
 */
export async function cancelOtaJob(jobId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const admin = createAdminClient();

  const { data: job } = await admin
    .from("firmware_update_jobs")
    .select("id, device_id, state")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return { ok: false, error: "job not found" };

  const { data: device } = await admin.from("iot_nodes").select("farm_id").eq("id", job.device_id as string).maybeSingle();
  const { data: farm } = await admin.from("farms").select("user_id").eq("id", device?.farm_id as string).maybeSingle();
  if (!farm || farm.user_id !== user.id) return { ok: false, error: "not owner" };

  if (job.state !== "requested") {
    return { ok: false, error: "job already past the cancellable stage" };
  }

  await admin
    .from("firmware_update_jobs")
    .update({ state: "cancelled", completed_at: new Date().toISOString() })
    .eq("id", jobId);

  revalidatePath(`/dashboard/devices/${job.device_id}`);
  return { ok: true };
}
