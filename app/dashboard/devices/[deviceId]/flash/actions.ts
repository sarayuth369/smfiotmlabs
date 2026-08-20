"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FirmwareManifest, FirmwareArtifact, ArtifactRole } from "@/lib/firmware-manifest";

const FIRMWARE_BUCKET = "firmware";
const SIGNED_URL_TTL_SECONDS = 60;

type FirmwareRow = {
  id: string;
  version: string;
  build: string | null;
  board: string;
  hardware_model: string;
  release_channel: "test" | "stable" | "deprecated" | "revoked";
  approved_at: string | null;
  app_path: string;
  app_offset: number;
  sha256_app: string;
  bootloader_path: string | null;
  bootloader_offset: number;
  sha256_bootloader: string | null;
  partitions_path: string | null;
  partitions_offset: number;
  sha256_partitions: string | null;
  boot_app0_path: string | null;
  boot_app0_offset: number;
  sha256_boot_app0: string | null;
  min_firmware_version: string | null;
  release_notes: string | null;
  is_latest: boolean;
  file_size: number;
};

type DeviceContext = {
  id: string;
  device_uid: string;
  device_name: string;
  hardware_model: string | null;
  firmware_version: string | null;
};

export type FirmwareOverview = {
  device: DeviceContext;
  current_version: string | null;
  latest: {
    release_id: string;
    version: string;
    build: string | null;
    board: string;
    hardware_model: string;
    channel: string;
    total_size: number;
    sha256_app: string;
  } | null;
};

export type ManifestResult =
  | { ok: true; manifest: FirmwareManifest }
  | { ok: false; error: string };

async function loadDeviceForUser(deviceId: string): Promise<DeviceContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Server-side ownership check: iot_nodes → farms.user_id
  const admin = createAdminClient();
  const { data: node } = await admin
    .from("iot_nodes")
    .select("id, farm_id, device_uid, device_name, hardware_model, firmware_version")
    .eq("id", deviceId)
    .maybeSingle();
  if (!node) return null;

  const { data: farm } = await admin
    .from("farms")
    .select("id")
    .eq("id", node.farm_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!farm) return null;

  return {
    id: node.id as string,
    device_uid: node.device_uid as string,
    device_name: node.device_name as string,
    hardware_model: (node.hardware_model as string | null) ?? null,
    firmware_version: (node.firmware_version as string | null) ?? null,
  };
}

/**
 * Read-only overview for the flash page: device meta + latest compatible release.
 * Does NOT issue signed URLs (user must confirm before flashing).
 */
export async function getFirmwareOverview(deviceId: string): Promise<FirmwareOverview | null> {
  const device = await loadDeviceForUser(deviceId);
  if (!device) return null;

  const admin = createAdminClient();
  const targetModel = device.hardware_model ?? "ESP32-S3";

  // Pick latest approved release for the device's hardware model (or generic S3 fallback)
  const { data: releases } = await admin
    .from("firmware_releases")
    .select(
      "id, version, build, board, hardware_model, release_channel, is_latest, approved_at, sha256_app, file_size"
    )
    .in("hardware_model", [targetModel, "ESP32-S3"])
    .in("release_channel", ["test", "stable"])
    .not("approved_at", "is", null)
    .order("is_latest", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  const latest = (releases ?? [])[0] ?? null;

  return {
    device,
    current_version: device.firmware_version,
    latest: latest
      ? {
          release_id: latest.id as string,
          version: latest.version as string,
          build: (latest.build as string | null) ?? null,
          board: latest.board as string,
          hardware_model: latest.hardware_model as string,
          channel: latest.release_channel as string,
          total_size: latest.file_size as number,
          sha256_app: latest.sha256_app as string,
        }
      : null,
  };
}

/**
 * Server action returning a signed-URL firmware manifest to a device owner.
 * Enforces: auth, device ownership, release approved, hardware compatibility.
 * URLs valid 60s only. Called immediately before flash starts.
 */
export async function getFirmwareManifest(deviceId: string, releaseId: string): Promise<ManifestResult> {
  const device = await loadDeviceForUser(deviceId);
  if (!device) return { ok: false, error: "device not found or not owned" };

  const admin = createAdminClient();
  const { data: rowUnknown } = await admin
    .from("firmware_releases")
    .select(
      "id, version, build, board, hardware_model, release_channel, approved_at, app_path, app_offset, sha256_app, bootloader_path, bootloader_offset, sha256_bootloader, partitions_path, partitions_offset, sha256_partitions, boot_app0_path, boot_app0_offset, sha256_boot_app0, min_firmware_version, release_notes, is_latest, file_size"
    )
    .eq("id", releaseId)
    .maybeSingle();
  const row = rowUnknown as FirmwareRow | null;
  if (!row) return { ok: false, error: "release not found" };
  if (!row.approved_at) return { ok: false, error: "release not approved" };
  if (row.release_channel === "revoked" || row.release_channel === "deprecated") {
    return { ok: false, error: "release not available" };
  }
  if (row.board !== "ESP32-S3") return { ok: false, error: "release board mismatch" };

  const deviceModel = device.hardware_model ?? "ESP32-S3";
  const modelOk = row.hardware_model === deviceModel || row.hardware_model === "ESP32-S3";
  if (!modelOk) return { ok: false, error: `hardware_model mismatch: device=${deviceModel}, release=${row.hardware_model}` };

  const paths: { role: ArtifactRole; path: string; offset: number; sha256: string | null }[] = [];
  if (row.bootloader_path)
    paths.push({ role: "bootloader", path: row.bootloader_path, offset: row.bootloader_offset, sha256: row.sha256_bootloader });
  if (row.partitions_path)
    paths.push({ role: "partitions", path: row.partitions_path, offset: row.partitions_offset, sha256: row.sha256_partitions });
  if (row.boot_app0_path)
    paths.push({ role: "boot_app0", path: row.boot_app0_path, offset: row.boot_app0_offset, sha256: row.sha256_boot_app0 });
  paths.push({ role: "app", path: row.app_path, offset: row.app_offset, sha256: row.sha256_app });

  const artifacts: FirmwareArtifact[] = [];
  for (const p of paths) {
    if (p.role !== "app" && !p.sha256) {
      return { ok: false, error: `missing sha256 for ${p.role}` };
    }
    const { data: signed, error: signedErr } = await admin.storage
      .from(FIRMWARE_BUCKET)
      .createSignedUrl(p.path, SIGNED_URL_TTL_SECONDS);
    if (signedErr || !signed) {
      return { ok: false, error: `sign url failed for ${p.role}: ${signedErr?.message ?? "unknown"}` };
    }
    artifacts.push({
      role: p.role,
      offset: p.offset,
      url: signed.signedUrl,
      size: 0, // client will read Content-Length or arrayBuffer.byteLength
      sha256: (p.sha256 ?? row.sha256_app).toLowerCase(),
    });
  }

  const issued = new Date();
  const expires = new Date(issued.getTime() + SIGNED_URL_TTL_SECONDS * 1000);
  const manifest: FirmwareManifest = {
    release_id: row.id,
    version: row.version,
    build: row.build,
    board: row.board,
    hardware_model: row.hardware_model,
    channel: row.release_channel,
    artifacts,
    sha256_app: row.sha256_app,
    min_firmware_version: row.min_firmware_version,
    release_notes: row.release_notes,
    issued_at: issued.toISOString(),
    expires_at: expires.toISOString(),
  };
  return { ok: true, manifest };
}

/**
 * Insert a firmware_update_jobs row with method='usb' + state='installing'.
 * Called client-side immediately before invoking esptool-js writeFlash.
 * Returns job id so client can call completeUsbFlashJob when done.
 */
export type StartFlashResult = { ok: true; job_id: string } | { ok: false; error: string };
export async function startUsbFlashJob(deviceId: string, releaseId: string): Promise<StartFlashResult> {
  const device = await loadDeviceForUser(deviceId);
  if (!device) return { ok: false, error: "device not found or not owned" };

  const admin = createAdminClient();
  const { data: rel } = await admin
    .from("firmware_releases")
    .select("id, version, hardware_model, board, approved_at, release_channel")
    .eq("id", releaseId)
    .maybeSingle();
  if (!rel || !rel.approved_at) return { ok: false, error: "release not approved" };
  if (rel.release_channel === "revoked") return { ok: false, error: "release revoked" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: inserted, error } = await admin
    .from("firmware_update_jobs")
    .insert({
      device_id: deviceId,
      firmware_release_id: releaseId,
      requested_by: user?.id ?? null,
      method: "usb",
      state: "installing",
      from_version: device.firmware_version,
      to_version: rel.version as string,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return { ok: false, error: "another flash job is active for this device" };
    return { ok: false, error: `job insert failed: ${error.message}` };
  }
  if (!inserted) return { ok: false, error: "job insert returned no row" };

  await admin.from("device_events").insert({
    device_id: deviceId,
    event_type: "firmware_flash_started",
    payload: {
      job_id: inserted.id,
      release_id: releaseId,
      to_version: rel.version,
      method: "usb",
      user_id: user?.id ?? null,
    },
  });

  return { ok: true, job_id: inserted.id as string };
}

export type CompleteFlashResult = { ok: true } | { ok: false; error: string };
export async function completeUsbFlashJob(
  jobId: string,
  outcome: "success" | "failed",
  errorMessage?: string | null
): Promise<CompleteFlashResult> {
  // Validate access: match job to a device the current user owns
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const admin = createAdminClient();
  const { data: job } = await admin
    .from("firmware_update_jobs")
    .select("id, device_id, to_version, firmware_release_id")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return { ok: false, error: "job not found" };

  const { data: node } = await admin
    .from("iot_nodes")
    .select("id, farm_id")
    .eq("id", job.device_id)
    .maybeSingle();
  if (!node) return { ok: false, error: "device gone" };

  const { data: farm } = await admin
    .from("farms")
    .select("id")
    .eq("id", node.farm_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!farm) return { ok: false, error: "not owned" };

  const state = outcome === "success" ? "success" : "failed";
  const safeError = errorMessage ? String(errorMessage).slice(0, 500) : null;

  await admin
    .from("firmware_update_jobs")
    .update({
      state,
      completed_at: new Date().toISOString(),
      progress: outcome === "success" ? 100 : null,
      error_message: safeError,
    })
    .eq("id", jobId);

  await admin.from("device_events").insert({
    device_id: job.device_id,
    event_type: outcome === "success" ? "firmware_flash_success" : "firmware_flash_failed",
    payload: {
      job_id: jobId,
      release_id: job.firmware_release_id,
      to_version: job.to_version,
      method: "usb",
      user_id: user.id,
      error: safeError,
    },
  });

  return { ok: true };
}
