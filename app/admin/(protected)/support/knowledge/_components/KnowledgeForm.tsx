import { KNOWLEDGE_CATEGORIES, type KnowledgeEntry } from "@/lib/support/knowledge";

export function KnowledgeForm({
  action,
  entry,
  submitLabel,
}: {
  action: (formData: FormData) => void;
  entry?: KnowledgeEntry;
  submitLabel: string;
}) {
  return (
    <form action={action} className="card p-6 space-y-5">
      <div>
        <label className="text-xs font-semibold text-brand-900/70">หัวข้อ</label>
        <input name="title" defaultValue={entry?.title} required className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
      </div>

      <div>
        <label className="text-xs font-semibold text-brand-900/70">หมวดหมู่</label>
        <select name="category" defaultValue={entry?.category ?? KNOWLEDGE_CATEGORIES[0]} className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm">
          {KNOWLEDGE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-semibold text-brand-900/70">เนื้อหา</label>
        <textarea
          name="content"
          defaultValue={entry?.content}
          required
          rows={8}
          className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
          placeholder="เขียนคำตอบ/ข้อมูลที่ AI จะใช้อ้างอิงตอบลูกค้า — ยิ่งชัดเจนตรงประเด็น AI ยิ่งตอบได้แม่นยำ"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-brand-900/70">สถานะ</label>
        <select name="status" defaultValue={entry?.status ?? "draft"} className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm">
          <option value="draft">Draft — ยังไม่ใช้ตอบลูกค้า</option>
          <option value="published">Published — AI นำไปใช้ตอบได้</option>
        </select>
      </div>

      <div className="flex justify-end border-t border-border pt-4">
        <button type="submit" className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2 text-sm transition">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
