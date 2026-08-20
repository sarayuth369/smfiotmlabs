"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";
import { ESP32_S3_FLASH_OFFSETS } from "@/lib/firmware-manifest";

/**
 * Create firmware release row from uploaded artifacts.
 *
 * Storage upload happens client-side to `firmware/{release_id}/{filename}`
 * via signed upload URL (Phase 5.1). This action only registers the row +
 * validates SHA256 metadata. Signed URLs issued at read time.
 *
 * Admin-only. Requires 'firmware' RBAC module (Phase 5.1 — add to rbac.ts).
 */
export async function createFirmwareRelease(formData: FormData): Promise<void> {
  await requireModule("firmware");

  const version = String(formData.get("version") ?? "").trim();
  const board = String(formData.get("board") ?? "ESP32-S3").trim();
  const hardware_model = String(formData.get("hardware_model") ?? "").trim();
  const release_channel = String(formData.get("release_channel") ?? "test").trim();
  const release_notes = String(formData.get("release_notes") ?? "").trim() || null;
  const sha256_app = String(formData.get("sha256_app") ?? "").trim().toLowerCase();
  const file_size = parseInt(String(formData.get("file_size") ?? "0"), 10);
  const app_path = String(formData.get("app_path") ?? "").trim();
  const bootloader_path = String(formData.get("bootloader_path") ?? "").trim() || null;
  const partitions_path = String(formData.get("partitions_path") ?? "").trim() || null;

  // Validation — reject before insert
  if (!/^\d+\.\d+\.\d+/.test(version)) return;
  if (!hardware_model) return;
  if (!["test", "stable", "deprecated", "revoked"].includes(release_channel)) return;
  if (sha256_app.length !== 64 || !/^[0-9a-f]{64}$/.test(sha256_app)) return;
  if (file_size <= 0 || file_size > 16 * 1024 * 1024) return;
  if (!app_path) return;

  const admin = createAdminClient();
  const { error } = await admin.from("firmware_releases").insert({
    version,
    board,
    hardware_model,
    release_channel,
    release_notes,
    sha256_app,
    file_size,
    app_path,
    app_offset: ESP32_S3_FLASH_OFFSETS.app,
    bootloader_path,
    bootloader_offset: ESP32_S3_FLASH_OFFSETS.bootloader,
    partitions_path,
    partitions_offset: ESP32_S3_FLASH_OFFSETS.partitions,
  });
  if (error) {
    console.warn("[firmware.create] db error", error);
    return;
  }

  revalidatePath("/admin/firmware");
}

/**
 * Approve a firmware release — flips approved_at + approved_by.
 * Non-approved releases are invisible to users (RLS).
 */
export async function approveFirmwareRelease(releaseId: string): Promise<void> {
  await requireModule("firmware");
  const admin = createAdminClient();
  const session = await import("@/lib/admin/current").then((m) => m.requireAdmin());

  await admin
    .from("firmware_releases")
    .update({
      approved_at: new Date().toISOString(),
      approved_by: null, // TODO: link to auth.users when admin session extends to user_id
    })
    .eq("id", releaseId);

  revalidatePath("/admin/firmware");
}

/**
 * Mark a release as `is_latest=true` for its (hardware_model, channel).
 * Partial UNIQUE index guarantees only one latest per (model, channel).
 */
export async function setFirmwareLatest(releaseId: string): Promise<void> {
  await requireModule("firmware");
  const admin = createAdminClient();

  // Fetch the target release to know its model + channel
  const { data: rel } = await admin
    .from("firmware_releases")
    .select("hardware_model, release_channel")
    .eq("id", releaseId)
    .maybeSingle();
  if (!rel) return;

  // Clear existing latest in same slot, then set new
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
