import Link from "next/link";
import { requireModule } from "@/lib/admin/current";
import { createKnowledgeAction } from "../actions";
import { KnowledgeForm } from "../_components/KnowledgeForm";

export default async function NewKnowledgePage() {
  await requireModule("support_chat");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/admin/support/knowledge" className="text-xs text-brand-700 hover:text-brand-900">← Knowledge Base</Link>
        <h1 className="text-2xl font-bold text-brand-800 mt-1">เพิ่มความรู้ใหม่</h1>
      </div>
      <KnowledgeForm action={createKnowledgeAction} submitLabel="สร้าง" />
    </div>
  );
}
