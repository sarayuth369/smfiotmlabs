import { createAdminClient } from "@/lib/supabase/admin";

export type LineSettings = {
  channel_access_token: string;
  group_id: string;
  enabled: boolean;
};

const DEFAULT_LINE: LineSettings = {
  channel_access_token: "",
  group_id: "",
  enabled: false,
};

export async function getLineSettings(): Promise<LineSettings> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("system_settings")
    .select("value")
    .eq("key", "line")
    .maybeSingle();

  const v = (data?.value ?? {}) as Partial<LineSettings>;
  return {
    channel_access_token: v.channel_access_token ?? DEFAULT_LINE.channel_access_token,
    group_id: v.group_id ?? DEFAULT_LINE.group_id,
    enabled: v.enabled ?? DEFAULT_LINE.enabled,
  };
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
