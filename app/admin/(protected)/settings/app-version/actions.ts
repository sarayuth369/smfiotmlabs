"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

// Numeric per-segment compare — never string compare, so "1.9.0" vs
// "1.10.0" and "1.0.9" vs "1.0.10" both resolve correctly. Mirrors
// AppVersionService.compare() on the Flutter side and the DB's own
// semver_parts() check constraint (scratchpad/phase-app-version-management.sql).
function semverGte(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i];
  }
  return true;
}

/**
 * Upsert-by-platform — the table's primary key IS the platform, so
 * "only one active policy per platform" holds trivially. Android only
 * from this form today; iOS just needs a second form/route later, same
 * schema. Never trusts the client with anything the DB check
 * constraints don't already enforce independently (see the migration).
 */
export async function updateAppVersionPolicy(formData: FormData): Promise<void> {
  await requireModule("settings");

  const platform = "android" as const;
  const latest_version = String(formData.get("latest_version") ?? "").trim();
  const minimum_version = String(formData.get("minimum_version") ?? "").trim();
  const force_update = formData.get("force_update") === "on";
  const is_active = formData.get("is_active") === "on";
  const release_notes = String(formData.get("release_notes") ?? "").trim() || null;
  const play_store_url = String(formData.get("play_store_url") ?? "").trim() || null;

  if (!SEMVER_RE.test(latest_version) || !SEMVER_RE.test(minimum_version)) {
    console.warn("[app-version.update] invalid semver, rejected", { latest_version, minimum_version });
    return;
  }
  if (!semverGte(latest_version, minimum_version)) {
    console.warn("[app-version.update] latest_version < minimum_version, rejected");
    return;
  }
  if (play_store_url && !/^https:\/\/play\.google\.com\//.test(play_store_url)) {
    console.warn("[app-version.update] play_store_url must be a play.google.com URL, rejected");
    return;
  }

  const admin = createAdminClient();
  const { error } = await admin.from("app_version_policies").upsert(
    { platform, latest_version, minimum_version, force_update, release_notes, play_store_url, is_active },
    { onConflict: "platform" }
  );
  if (error) console.warn("[app-version.update] db error", error);

  revalidatePath("/admin/settings/app-version");
}
