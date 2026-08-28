import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/admin/current";
import { getKnowledgeEntry } from "@/lib/support/knowledge";
import { updateKnowledgeAction } from "../../actions";
import { KnowledgeForm } from "../../_components/KnowledgeForm";

export default async function EditKnowledgePage({ params }: { params: Promise<{ id: string }> }) {
  await requireModule("support_chat");
  const { id } = await params;
  const entry = await getKnowledgeEntry(id);
  if (!entry) notFound();

  const boundAction = updateKnowledgeAction.bind(null, id);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/admin/support/knowledge" className="text-xs text-brand-700 hover:text-brand-900">← Knowledge Base</Link>
        <h1 className="text-2xl font-bold text-brand-800 mt-1">แก้ไขความรู้</h1>
      </div>
      <KnowledgeForm action={boundAction} entry={entry} submitLabel="บันทึก" />
    </div>
  );
}
