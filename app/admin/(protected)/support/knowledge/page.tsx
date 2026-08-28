import Link from "next/link";
import { requireModule } from "@/lib/admin/current";
import { listKnowledge } from "@/lib/support/knowledge";
import { deleteKnowledgeAction, togglePublishAction } from "./actions";

export default async function SupportKnowledgePage() {
  await requireModule("support_chat");
  const entries = await listKnowledge();

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/support" className="text-xs text-brand-700 hover:text-brand-900">← Customer Support</Link>
          <h1 className="text-2xl font-bold text-brand-800 mt-1">Support Knowledge Base</h1>
          <p className="text-sm text-brand-900/60 mt-1">AI จะดึงเฉพาะบทความที่เกี่ยวข้องมาใช้ตอบ ไม่ใช่ส่งทั้งหมดทุกครั้ง</p>
        </div>
        <Link href="/admin/support/knowledge/new" className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2 text-sm transition shrink-0">
          + เพิ่มความรู้
        </Link>
      </div>

      {entries.length === 0 ? (
        <div className="card p-10 text-center text-brand-900/50 text-sm">ยังไม่มีบทความ — เริ่มเพิ่มความรู้แรกได้เลย</div>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <div key={e.id} className="card p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-100 text-brand-700">{e.category}</span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      e.status === "published" ? "bg-green-100 text-green-800" : "bg-brand-100 text-brand-700/60"
                    }`}
                  >
                    {e.status === "published" ? "Published" : "Draft"}
                  </span>
                </div>
                <div className="font-semibold text-brand-800 mt-1 truncate">{e.title}</div>
                <p className="text-xs text-brand-900/50 mt-0.5 truncate">{e.content}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <form action={togglePublishAction}>
                  <input type="hidden" name="id" value={e.id} />
                  <input type="hidden" name="next_status" value={e.status === "published" ? "draft" : "published"} />
                  <button type="submit" className="text-xs rounded-full border border-border hover:border-brand-400 text-brand-800 px-3 py-1.5 font-medium transition">
                    {e.status === "published" ? "Unpublish" : "Publish"}
                  </button>
                </form>
                <Link href={`/admin/support/knowledge/${e.id}/edit`} className="text-xs rounded-full border border-border hover:border-brand-400 text-brand-800 px-3 py-1.5 font-medium transition">
                  แก้ไข
                </Link>
                <form action={deleteKnowledgeAction}>
                  <input type="hidden" name="id" value={e.id} />
                  <button type="submit" className="text-xs rounded-full border border-red-200 hover:bg-red-50 text-red-700 px-3 py-1.5 font-medium transition">
                    ลบ
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
