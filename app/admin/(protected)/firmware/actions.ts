"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";
import { ESP32_S3_FLASH_OFFSETS, type ArtifactRole } from "@/lib/firmware-manifest";

const FIRMWARE_BUCKET = "firmware";
const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;

type SignedUploadEntry = {
  role: ArtifactRole;
  path: string;
  signed_url: string;
  token: string;
};

export type ReserveUploadResult =
  | { ok: true; release_id: string; entries: SignedUploadEntry[]; bucket: string }
  | { ok: false; error: string };

export type CreateReleaseResult =
  | { ok: true; release_id: string }
  | { ok: false; error: string };

/**
 * Step 1 — reserve release id + signed upload URLs for chosen artifacts.
 * Admin only. Does NOT create firmware_releases row yet — the row is inserted
 * in step 2 after all uploads succeed.
 */
export async function reserveFirmwareUploads(
  roles: ArtifactRole[]
): Promise<ReserveUploadResult> {
  await requireModule("firmware");

  if (!Array.isArray(roles) || roles.length === 0) {
    return { ok: false, error: "no roles selected" };
  }
  const allowed: ArtifactRole[] = ["bootloader", "partitions", "boot_app0", "app"];
  const clean = roles.filter((r) => allowed.includes(r));
  if (!clean.includes("app")) {
    return { ok: false, error: "app artifact is required" };
  }

  const admin = createAdminClient();
  const releaseId = crypto.randomUUID();
  const entries: SignedUploadEntry[] = [];

  for (const role of clean) {
    const filename =
      role === "app" ? "firmware.bin" : role === "bootloader" ? "bootloader.bin"
        : role === "partitions" ? "partitions.bin" : "boot_app0.bin";
    const path = `${releaseId}/${filename}`;
    const { data, error } = await admin.storage
      .from(FIRMWARE_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      return { ok: false, error: `signed upload failed: ${error?.message ?? "unknown"}` };
    }
    entries.push({
      role,
      path,
      signed_url: data.signedUrl,
      token: data.token,
    });
  }

  return { ok: true, release_id: releaseId, entries, bucket: FIRMWARE_BUCKET };
}

/**
 * Step 2 — finalize firmware release after client-side uploads finished.
 * Admin only. Validates SHA256 + sizes then inserts firmware_releases row.
 * Approval + is_latest remain manual steps.
 */
export async function createFirmwareRelease(formData: FormData): Promise<CreateReleaseResult> {
  await requireModule("firmware");

  const release_id = String(formData.get("release_id") ?? "").trim();
  const version = String(formData.get("version") ?? "").trim();
  const build = String(formData.get("build") ?? "").trim() || null;
  const board = String(formData.get("board") ?? "ESP32-S3").trim();
  const hardware_model = String(formData.get("hardware_model") ?? "").trim();
  const release_channel = String(formData.get("release_channel") ?? "test").trim();
  const release_notes = String(formData.get("release_notes") ?? "").trim() || null;
  const min_firmware_version = String(formData.get("min_firmware_version") ?? "").trim() || null;
  const rollout_percent_raw = String(formData.get("rollout_percent") ?? "100").trim();
  const rollout_percent = Number.isFinite(Number(rollout_percent_raw)) ? Math.max(0, Math.min(100, Math.round(Number(rollout_percent_raw)))) : 100;

  // Generic capability/sensor metadata — free-form, comma-separated in
  // the UI. Never a fixed enum here on purpose: a future sensor or
  // capability is just a new string, no code change in this action.
  const capabilities = String(formData.get("capabilities") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const sensor_types = String(formData.get("sensor_types") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const app_path = String(formData.get("app_path") ?? "").trim();
  const app_size = parseInt(String(formData.get("app_size") ?? "0"), 10);
  const sha256_app = String(formData.get("sha256_app") ?? "").trim().toLowerCase();

  const bootloader_path = String(formData.get("bootloader_path") ?? "").trim() || null;
  const bootloader_size = parseInt(String(formData.get("bootloader_size") ?? "0"), 10);
  const sha256_bootloader = (String(formData.get("sha256_bootloader") ?? "").trim() || null)?.toLowerCase() ?? null;

  const partitions_path = String(formData.get("partitions_path") ?? "").trim() || null;
  const partitions_size = parseInt(String(formData.get("partitions_size") ?? "0"), 10);
  const sha256_partitions = (String(formData.get("sha256_partitions") ?? "").trim() || null)?.toLowerCase() ?? null;

  const boot_app0_path = String(formData.get("boot_app0_path") ?? "").trim() || null;
  const boot_app0_size = parseInt(String(formData.get("boot_app0_size") ?? "0"), 10);
  const sha256_boot_app0 = (String(formData.get("sha256_boot_app0") ?? "").trim() || null)?.toLowerCase() ?? null;

  if (!release_id || !/^[0-9a-f-]{36}$/.test(release_id)) {
    return { ok: false, error: "invalid release_id" };
  }
  // Accept an optional leading "V"/"v" (matches the Vx.x.x label shown in
  // the admin UI / release notes) but store bare semver, consistent with
  // how it's already stored today — the "v" prefix is a display concern.
  const versionClean = version.replace(/^[vV]/, "");
  if (!/^\d+\.\d+\.\d+/.test(versionClean)) return { ok: false, error: "version must be semver, e.g. V1.2.0" };
  if (!hardware_model) return { ok: false, error: "hardware_model required" };
  if (board !== "ESP32-S3") return { ok: false, error: "board must be ESP32-S3" };
  if (!["test", "stable", "deprecated", "revoked"].includes(release_channel)) {
    return { ok: false, error: "invalid channel" };
  }
  if (!/^[0-9a-f]{64}$/.test(sha256_app)) return { ok: false, error: "sha256_app malformed" };
  if (app_size <= 0 || app_size > MAX_ARTIFACT_BYTES) return { ok: false, error: "app_size out of range" };
  if (!app_path) return { ok: false, error: "app_path required" };

  const validSha = (v: string | null) => v === null || /^[0-9a-f]{64}$/.test(v);
  if (!validSha(sha256_bootloader)) return { ok: false, error: "sha256_bootloader malformed" };
  if (!validSha(sha256_partitions)) return { ok: false, error: "sha256_partitions malformed" };
  if (!validSha(sha256_boot_app0)) return { ok: false, error: "sha256_boot_app0 malformed" };

  const total_size = app_size + Math.max(0, bootloader_size) + Math.max(0, partitions_size) + Math.max(0, boot_app0_size);
  if (total_size > MAX_ARTIFACT_BYTES * 2) return { ok: false, error: "total size too large" };

  const admin = createAdminClient();
  const { error } = await admin.from("firmware_releases").insert({
    id: release_id,
    version: versionClean,
    build,
    board,
    hardware_model,
    release_channel,
    release_notes,
    min_firmware_version,
    rollout_percent,
    capabilities,
    sensor_types,
    sha256_app,
    file_size: total_size,
    app_path,
    app_offset: ESP32_S3_FLASH_OFFSETS.app,
    bootloader_path,
    bootloader_offset: ESP32_S3_FLASH_OFFSETS.bootloader,
    sha256_bootloader,
    partitions_path,
    partitions_offset: ESP32_S3_FLASH_OFFSETS.partitions,
    sha256_partitions,
    boot_app0_path,
    boot_app0_offset: ESP32_S3_FLASH_OFFSETS.boot_app0,
    sha256_boot_app0,
  });
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "duplicate version for this hardware model" };
    }
    console.warn("[firmware.create] db error", error);
    return { ok: false, error: `db insert failed: ${error.message}` };
  }

  revalidatePath("/admin/firmware");
  return { ok: true, release_id };
}

/**
 * Approve a firmware release — flips approved_at.
 */
export async function approveFirmwareRelease(releaseId: string): Promise<void> {
  await requireModule("firmware");
  const admin = createAdminClient();

  await admin
    .from("firmware_releases")
    .update({ approved_at: new Date().toISOString() })
    .eq("id", releaseId);

  revalidatePath("/admin/firmware");
}

/**
 * Mark a release as `is_latest=true` for its (hardware_model, channel).
 * Only approved releases can be set latest.
 */
export async function setFirmwareLatest(releaseId: string): Promise<void> {
  await requireModule("firmware");
  const admin = createAdminClient();

  const { data: rel } = await admin
    .from("firmware_releases")
    .select("hardware_model, release_channel, approved_at")
    .eq("id", releaseId)
    .maybeSingle();
  if (!rel || !rel.approved_at) return;

  await admin
    .from("firmware_releases")
    .update({ is_latest: false })
    .eq("hardware_model", rel.hardware_model)
    .eq("release_channel", rel.release_channel)
    .eq("is_latest", true);

  await admin
    .from("firmware_releases")
    .update({ is_latest: true })
    .eq("id", releaseId);

  revalidatePath("/admin/firmware");
}

/**
 * Adjust staged rollout after creation — e.g. start at 10%, watch OTA
 * job success rate, then raise to 100%. Any approved/unapproved release
 * can have this changed at any time.
 */
export async function setRolloutPercent(releaseId: string, percent: number): Promise<void> {
  await requireModule("firmware");
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const admin = createAdminClient();
  await admin.from("firmware_releases").update({ rollout_percent: clamped }).eq("id", releaseId);
  revalidatePath("/admin/firmware");
}

/**
 * Deprecate a release (removes from user download list without deleting).
 */
export async function deprecateFirmwareRelease(releaseId: string): Promise<void> {
  await requireModule("firmware");
  const admin = createAdminClient();
  await admin
    .from("firmware_releases")
    .update({ release_channel: "deprecated", is_latest: false })
    .eq("id", releaseId);
  revalidatePath("/admin/firmware");
}
