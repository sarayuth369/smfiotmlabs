"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireModule } from "@/lib/admin/current";
import { createKnowledgeEntry, updateKnowledgeEntry, deleteKnowledgeEntry, getKnowledgeEntry, type KnowledgeStatus } from "@/lib/support/knowledge";

function readEntry(formData: FormData) {
  const status: KnowledgeStatus = formData.get("status") === "published" ? "published" : "draft";
  return {
    title: String(formData.get("title") ?? "").trim(),
    category: String(formData.get("category") ?? "").trim() || "General FAQ",
    content: String(formData.get("content") ?? "").trim(),
    status,
  };
}

export async function createKnowledgeAction(formData: FormData): Promise<void> {
  await requireModule("support_chat");
  const entry = readEntry(formData);
  if (!entry.title || !entry.content) return;
  await createKnowledgeEntry(entry);
  revalidatePath("/admin/support/knowledge");
  redirect("/admin/support/knowledge");
}

export async function updateKnowledgeAction(id: string, formData: FormData): Promise<void> {
  await requireModule("support_chat");
  const entry = readEntry(formData);
  if (!entry.title || !entry.content) return;
  await updateKnowledgeEntry(id, entry);
  revalidatePath("/admin/support/knowledge");
  redirect("/admin/support/knowledge");
}

export async function deleteKnowledgeAction(formData: FormData): Promise<void> {
  await requireModule("support_chat");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await deleteKnowledgeEntry(id);
  revalidatePath("/admin/support/knowledge");
}

export async function togglePublishAction(formData: FormData): Promise<void> {
  await requireModule("support_chat");
  const id = String(formData.get("id") ?? "");
  const nextStatus = formData.get("next_status") === "published" ? "published" : "draft";
  if (!id) return;
  const current = await getKnowledgeEntry(id);
  if (!current) return;
  await updateKnowledgeEntry(id, { title: current.title, category: current.category, content: current.content, status: nextStatus });
  revalidatePath("/admin/support/knowledge");
}
