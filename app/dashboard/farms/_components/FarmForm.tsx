import Link from "next/link";

const FARM_TYPES = ["ผัก", "ผลไม้", "ข้าว", "โรงเรือน", "Hydroponic", "Smart Farm"] as const;
const AREA_UNITS = ["ไร่", "งาน", "ตร.ว.", "ตร.ม."] as const;

export type FarmFormValues = {
  name?: string;
  description?: string | null;
  province?: string | null;
  district?: string | null;
  subdistrict?: string | null;
  area?: number | null;
  area_unit?: string | null;
  farm_type?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export function FarmForm({
  action,
  initial,
  submitLabel,
  cancelHref,
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: FarmFormValues;
  submitLabel: string;
  cancelHref: string;
}) {
  const v = initial ?? {};
  return (
    <form action={action} className="card p-6 sm:p-8 space-y-5">
      <div>
        <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">
          ชื่อฟาร์ม <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          name="name"
          defaultValue={v.name ?? ""}
          required
          maxLength={120}
          placeholder="เช่น สวนผักบ้านนา"
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

      <div className="grid sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">จังหวัด</label>
          <input
            type="text"
            name="province"
            defaultValue={v.province ?? ""}
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">อำเภอ</label>
          <input
            type="text"
            name="district"
            defaultValue={v.district ?? ""}
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">ตำบล</label>
          <input
            type="text"
            name="subdistrict"
            defaultValue={v.subdistrict ?? ""}
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
          />
        </div>
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
            placeholder="เช่น 2.5"
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

      <div>
        <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">ประเภทฟาร์ม</label>
        <select
          name="farm_type"
          defaultValue={v.farm_type ?? ""}
          className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
        >
          <option value="">— ไม่ระบุ —</option>
          {FARM_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <details className="border-t border-border pt-4">
        <summary className="cursor-pointer text-sm font-semibold text-brand-700">
          พิกัดที่ตั้ง (Latitude / Longitude) — ไม่บังคับ
        </summary>
        <div className="mt-3 grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-brand-900/70 mb-1">Latitude</label>
            <input
              type="number"
              name="latitude"
              defaultValue={v.latitude ?? ""}
              step="0.000001"
              placeholder="13.756331"
              className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-brand-900/70 mb-1">Longitude</label>
            <input
              type="number"
              name="longitude"
              defaultValue={v.longitude ?? ""}
              step="0.000001"
              placeholder="100.501765"
              className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
            />
          </div>
        </div>
      </details>

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
