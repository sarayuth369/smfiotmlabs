/**
 * OTA eligibility + release resolution. Server-only.
 *
 * Deliberately generic — nothing here names a specific sensor or
 * capability. firmware_releases.capabilities / sensor_types are free-form
 * string arrays the admin fills in per release; a future sensor only
 * needs a new release row with a new string in that array, never a code
 * change in this file.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { compareVersions, isUpdateAvailable, isValidVersion } from "@/lib/firmware";

export type OtaRelease = {
  id: string;
  version: string;
  release_notes: string | null;
  capabilities: string[];
  sensor_types: string[];
  min_firmware_version: string | null;
  release_channel: string;
};

export type OtaEligibility =
  | { eligible: true; current_version: string | null; release: OtaRelease }
  | { eligible: false; reason: string; current_version?: string | null; latest_release?: OtaRelease | null };

type ReleaseRow = {
  id: string;
  version: string;
  release_notes: string | null;
  capabilities: unknown;
  sensor_types: unknown;
  min_firmware_version: string | null;
  release_channel: string;
  rollout_percent: number | null;
};

function toRelease(r: ReleaseRow): OtaRelease {
  return {
    id: r.id,
    version: r.version,
    release_notes: r.release_notes ?? null,
    capabilities: Array.isArray(r.capabilities) ? (r.capabilities as string[]) : [],
    sensor_types: Array.isArray(r.sensor_types) ? (r.sensor_types as string[]) : [],
    min_firmware_version: r.min_firmware_version ?? null,
    release_channel: r.release_channel,
  };
}

/**
 * Deterministic 0-99 bucket for staged rollout — same device_id always
 * lands in the same bucket, so a device doesn't flap in/out of
 * eligibility between checks as rollout_percent climbs from e.g. 10 to 50.
 */
export function rolloutBucket(deviceId: string): number {
  let hash = 0;
  for (let i = 0; i < deviceId.length; i++) {
    hash = (hash * 31 + deviceId.charCodeAt(i)) >>> 0;
  }
  return hash % 100;
}

/**
 * Full server-side eligibility check — the ONLY place that decides
 * whether a device may OTA. Called by both the "check for update" read
 * path and (again, never trusting the first call's result) the actual
 * requestOtaUpdate() write path, so a client can never skip this by
 * calling the update endpoint directly.
 *
 * `admin` = service-role client (bypasses RLS) because this reads across
 * iot_nodes/farms/profiles/subscription_plans/firmware_releases; ownership
 * is enforced explicitly below instead of relying on RLS.
 */
export async function resolveOtaEligibility(
  admin: SupabaseClient,
  userId: string,
  deviceId: string
): Promise<OtaEligibility> {
  const { data: device } = await admin
    .from("iot_nodes")
    .select("id, device_uid, firmware_version, hardware_model, farm_id, is_disabled, archived_at")
    .eq("id", deviceId)
    .maybeSingle();
  if (!device) return { eligible: false, reason: "device_not_found" };
  if (device.archived_at) return { eligible: false, reason: "device_archived" };
  if (device.is_disabled) return { eligible: false, reason: "device_disabled" };

  const { data: farm } = await admin
    .from("farms")
    .select("user_id")
    .eq("id", device.farm_id as string)
    .maybeSingle();
  if (!farm || farm.user_id !== userId) return { eligible: false, reason: "not_owner" };

  const { data: profile } = await admin.from("profiles").select("plan").eq("id", userId).maybeSingle();
  const { data: planRow } = await admin
    .from("subscription_plans")
    .select("entitlements")
    .eq("plan_id", (profile?.plan as string | null) ?? "starter")
    .maybeSingle();
  const ent = (planRow?.entitlements as Record<string, unknown> | null) ?? {};
  const currentVersion = (device.firmware_version as string | null) ?? null;
  if (!ent.ota) return { eligible: false, reason: "plan_no_ota", current_version: currentVersion };

  const hardwareModel = (device.hardware_model as string | null) ?? null;
  if (!hardwareModel) return { eligible: false, reason: "no_hardware_model", current_version: currentVersion };

  const { data: releaseRows } = await admin
    .from("firmware_releases")
    .select("id, version, release_notes, capabilities, sensor_types, min_firmware_version, release_channel, rollout_percent")
    .in("hardware_model", [hardwareModel, "ESP32-S3"])
    .in("release_channel", ["stable", "test"])
    .not("approved_at", "is", null);
  const candidates = (releaseRows ?? []) as ReleaseRow[];
  if (candidates.length === 0) return { eligible: false, reason: "no_release", current_version: currentVersion };

  const bucket = rolloutBucket(deviceId);
  let best: ReleaseRow | null = null;
  for (const r of candidates) {
    if (!isValidVersion(r.version)) continue; // reject non-semver rows defensively
    if (r.min_firmware_version && currentVersion && compareVersions(currentVersion, r.min_firmware_version) < 0) {
      continue; // device firmware too old to jump straight to this release
    }
    const rollout = r.rollout_percent ?? 100;
    if (bucket >= rollout) continue; // this device hasn't reached this release's staged rollout yet
    if (!best || compareVersions(r.version, best.version) > 0) best = r;
  }
  if (!best) return { eligible: false, reason: "no_eligible_release", current_version: currentVersion };

  if (!isUpdateAvailable(currentVersion, best.version)) {
    return { eligible: false, reason: "up_to_date", current_version: currentVersion, latest_release: toRelease(best) };
  }

  return { eligible: true, current_version: currentVersion, release: toRelease(best) };
}

/** Short-lived signed download URL for the app artifact of one release. */
export async function getFirmwareDownloadUrl(
  admin: SupabaseClient,
  releaseId: string,
  ttlSeconds: number = 60
): Promise<{ ok: true; url: string; sha256: string } | { ok: false; error: string }> {
  const { data: rel } = await admin
    .from("firmware_releases")
    .select("app_path, sha256_app")
    .eq("id", releaseId)
    .maybeSingle();
  if (!rel?.app_path) return { ok: false, error: "release_missing_app_path" };

  const { data, error } = await admin.storage.from("firmware").createSignedUrl(rel.app_path as string, ttlSeconds);
  if (error || !data) return { ok: false, error: error?.message ?? "signed_url_failed" };

  return { ok: true, url: data.signedUrl, sha256: rel.sha256_app as string };
}
