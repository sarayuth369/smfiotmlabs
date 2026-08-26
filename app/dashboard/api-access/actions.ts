"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPlan, hasFeature } from "@/lib/plan-limits";
import { generateApiKey } from "@/lib/api-keys";
import { PERMISSIONS, READ_ONLY_PERMISSIONS, CONTROL_PERMISSIONS, logApiEvent, type Permission } from "@/lib/api-auth";
import { generateWebhookSecret, encryptWebhookSecret, sendTestWebhook } from "@/lib/webhooks";

async function requireApiEnabled(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthenticated");
  const plan = await getUserPlan(supabase, user.id);
  if (!hasFeature(plan, "api")) throw new Error(`แพ็กเกจ ${plan.name} ไม่รองรับ API Access`);
  return { user, plan };
}

export type CreateKeyResult = { ok: true; plaintext: string; prefix: string } | { ok: false; error: string };

export async function createApiKey(formData: FormData): Promise<CreateKeyResult> {
  const supabase = await createClient();
  let user, plan;
  try {
    ({ user, plan } = await requireApiEnabled(supabase));
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "กรุณาตั้งชื่อ key" };

  const requestedPerms = formData.getAll("permissions").map(String) as Permission[];
  const validRequested = requestedPerms.filter((p) => (PERMISSIONS as readonly string[]).includes(p));
  const allowedSet = hasFeature(plan, "api_control")
    ? [...READ_ONLY_PERMISSIONS, ...CONTROL_PERMISSIONS]
    : READ_ONLY_PERMISSIONS;
  const permissions = validRequested.filter((p) => allowedSet.includes(p));
  if (permissions.length === 0) return { ok: false, error: "เลือก permission อย่างน้อย 1 อย่าง" };

  const scopeRaw = formData.getAll("scope_device_ids").map(String).filter(Boolean);
  const scope_device_ids = scopeRaw.length > 0 ? scopeRaw : null;

  const { count } = await supabase.from("api_keys").select("id", { count: "exact", head: true }).is("revoked_at", null);
  const limit = plan.limits.max_api_keys;
  if (limit !== null && (count ?? 0) >= limit) {
    return { ok: false, error: `คุณใช้ API key ครบตามแพ็กเกจ ${plan.name} แล้ว (${count}/${limit})` };
  }

  const generated = generateApiKey();
  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      user_id: user.id,
      name,
      key_prefix: generated.prefix,
      key_hash: generated.hash,
      permissions,
      scope_device_ids,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  await logApiEvent(createAdminClient(), user.id, data.id as string, "api_key_created", { name, permissions }, null);
  revalidatePath("/dashboard/api-access");

  return { ok: true, plaintext: generated.plaintext, prefix: generated.prefix };
}

export async function revokeApiKey(keyId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("user_id", user.id);
  if (!error) {
    await logApiEvent(createAdminClient(), user.id, keyId, "api_key_revoked", null, null);
    revalidatePath("/dashboard/api-access");
  }
}

export type CreateWebhookResult = { ok: true } | { ok: false; error: string };

export async function createWebhook(formData: FormData): Promise<CreateWebhookResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const plan = await getUserPlan(supabase, user.id);
  if (!hasFeature(plan, "api_control")) {
    return { ok: false, error: `แพ็กเกจ ${plan.name} ไม่รองรับ Webhook` };
  }

  const url = String(formData.get("url") ?? "").trim();
  if (!/^https:\/\//.test(url)) return { ok: false, error: "URL ต้องเป็น https://" };
  const events = formData.getAll("events").map(String).filter(Boolean);
  if (events.length === 0) return { ok: false, error: "เลือก event อย่างน้อย 1 อย่าง" };

  const secret = generateWebhookSecret();
  const { error } = await supabase.from("webhooks").insert({
    user_id: user.id,
    url,
    secret_encrypted: encryptWebhookSecret(secret),
    events,
    enabled: true,
  });
  if (error) return { ok: false, error: error.message };

  await logApiEvent(createAdminClient(), user.id, null, "webhook_created", { url, events }, null);
  revalidatePath("/dashboard/api-access");
  return { ok: true };
}

export async function toggleWebhook(webhookId: string, enabled: boolean): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from("webhooks").update({ enabled, updated_at: new Date().toISOString() }).eq("id", webhookId).eq("user_id", user.id);
  if (!error) {
    await logApiEvent(createAdminClient(), user.id, null, "webhook_changed", { webhook_id: webhookId, enabled }, null);
    revalidatePath("/dashboard/api-access");
  }
}

export async function deleteWebhook(webhookId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from("webhooks").delete().eq("id", webhookId).eq("user_id", user.id);
  if (!error) {
    await logApiEvent(createAdminClient(), user.id, null, "webhook_changed", { webhook_id: webhookId, deleted: true }, null);
    revalidatePath("/dashboard/api-access");
  }
}

export async function testWebhookAction(webhookId: string): Promise<{ ok: boolean; status: number | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: null };

  const { data: hook } = await supabase
    .from("webhooks")
    .select("id, url, secret_encrypted")
    .eq("id", webhookId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!hook) return { ok: false, status: null };

  // Ownership already verified above via the user-scoped client — the
  // insert into webhook_deliveries itself needs the service-role client
  // since that table intentionally has no INSERT policy for regular users.
  return sendTestWebhook(createAdminClient(), hook as { id: string; url: string; secret_encrypted: string });
}
