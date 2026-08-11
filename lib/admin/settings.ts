import { createAdminClient } from "@/lib/supabase/admin";

export type LineMode = "broadcast" | "group" | "user";

export type LineSettings = {
  channel_access_token: string;
  mode: LineMode;
  target_id: string; // only used when mode is 'group' or 'user'
  enabled: boolean;
};

const DEFAULT_LINE: LineSettings = {
  channel_access_token: "",
  mode: "broadcast",
  target_id: "",
  enabled: false,
};

export async function getLineSettings(): Promise<LineSettings> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("system_settings")
    .select("value")
    .eq("key", "line")
    .maybeSingle();

  const v = (data?.value ?? {}) as Partial<LineSettings> & { group_id?: string };
  const mode: LineMode =
    v.mode === "group" || v.mode === "user" || v.mode === "broadcast"
      ? v.mode
      : v.group_id
      ? "group"
      : DEFAULT_LINE.mode;

  return {
    channel_access_token: v.channel_access_token ?? DEFAULT_LINE.channel_access_token,
    mode,
    // Backward compat: if old row has group_id, fall through to target_id
    target_id: v.target_id ?? v.group_id ?? DEFAULT_LINE.target_id,
    enabled: v.enabled ?? DEFAULT_LINE.enabled,
  };
}

export function isLineReady(line: LineSettings): boolean {
  if (!line.enabled || !line.channel_access_token) return false;
  if (line.mode === "broadcast") return true;
  return !!line.target_id;
}

export async function saveLineSettings(next: LineSettings, updatedBy?: string) {
  const admin = createAdminClient();
  return admin.from("system_settings").upsert(
    {
      key: "line",
      value: next,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy ?? null,
    },
    { onConflict: "key" }
  );
}
