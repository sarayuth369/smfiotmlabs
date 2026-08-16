import Link from "next/link";

const AREA_UNITS = ["ไร่", "งาน", "ตร.ว.", "ตร.ม."] as const;

export type ZoneFormValues = {
  name?: string;
  description?: string | null;
  area?: number | null;
  area_unit?: string | null;
  crop_type?: string | null;
  planting_date?: string | null;
  expected_harvest_date?: string | null;
};

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  // date-only column comes back as "YYYY-MM-DD" already
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function ZoneForm({
  action,
  initial,
  submitLabel,
  cancelHref,
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: ZoneFormValues;
  submitLabel: string;
  cancelHref: string;
}) {
  const v = initial ?? {};
  return (
    <form action={action} className="card p-6 sm:p-8 space-y-5">
      <div>
        <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">
          ชื่อแปลง <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          name="name"
          defaultValue={v.name ?? ""}
          required
          maxLength={120}
          placeholder="เช่น Zone A / แปลงมะเขือเทศ"
          className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">รายละเอียด</label>
        <textarea
          name="description"
          defaultValue={v.description ?? ""}
          rows={3}
          className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition resize-y"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">พืชที่ปลูก</label>
        <input
          type="text"
          name="crop_type"
          defaultValue={v.crop_type ?? ""}
          placeholder="เช่น มะเขือเทศ, ข้าวหอมมะลิ, ผักสลัด"
          className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
        />
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">พื้นที่</label>
          <input
            type="number"
            name="area"
            defaultValue={v.area ?? ""}
            step="0.01"
            min="0"
            placeholder="เช่น 2"
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">หน่วย</label>
          <select
            name="area_unit"
            defaultValue={v.area_unit ?? "ไร่"}
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
          >
            {AREA_UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">วันที่เริ่มปลูก</label>
          <input
            type="date"
            name="planting_date"
            defaultValue={toDateInput(v.planting_date)}
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">
            วันที่คาดว่าจะเก็บเกี่ยว
          </label>
          <input
            type="date"
            name="expected_harvest_date"
            defaultValue={toDateInput(v.expected_harvest_date)}
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
        <Link
          href={cancelHref}
          className="rounded-full border border-border hover:bg-brand-50 text-brand-800 font-medium px-5 py-2.5 text-sm transition"
        >
          ยกเลิก
        </Link>
        <button
          type="submit"
          className="rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2.5 text-sm transition"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
