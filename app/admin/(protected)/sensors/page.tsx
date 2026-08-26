import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSensorType } from "./actions";
import { IconPicker } from "./_components/IconPicker";
import { SensorTypeRow } from "./_components/SensorTypeRow";

export default async function AdminSensorsPage() {
  await requireModule("sensors");
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from("sensor_type_catalog")
    .select("id, key, label, icon, default_unit, sort_order")
    .order("sort_order", { ascending: true });
  const catalog = rows ?? [];

  const keys = catalog.map((r) => r.key as string);
  const { data: usageRows } = keys.length
    ? await admin.from("sensors").select("sensor_type").in("sensor_type", keys)
    : { data: [] };
  const usageCount = new Map<string, number>();
  for (const r of usageRows ?? []) {
    const k = r.sensor_type as string;
    usageCount.set(k, (usageCount.get(k) ?? 0) + 1);
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-800">Sensors</h1>
        <p className="text-sm text-brand-900/60 mt-0.5">
          จัดการประเภท Sensor ที่ user เลือกได้ตอนเพิ่ม Sensor ให้ Node — เรียงตามลำดับที่สร้าง เพิ่มใหม่จะต่อท้าย
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="card p-6">
          <h2 className="font-bold text-brand-800 mb-1">รายการประเภท Sensor ({catalog.length})</h2>
          <p className="text-xs text-brand-900/50 mb-4">
            ลำดับนี้คือลำดับที่ user จะเห็นในหน้า &quot;เพิ่ม Sensor&quot; — บนสุด = แสดงก่อน
          </p>
          {catalog.length === 0 ? (
            <p className="text-sm text-brand-900/50">ยังไม่มีประเภท Sensor — เพิ่มจากฟอร์มด้านขวา</p>
          ) : (
            <div>
              {catalog.map((r) => (
                <SensorTypeRow
                  key={r.id as string}
                  row={{
                    id: r.id as string,
                    key: r.key as string,
                    label: r.label as string,
                    icon: r.icon as string,
                    unit: (r.default_unit as string) ?? "",
                    inUseCount: usageCount.get(r.key as string) ?? 0,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="card p-6 h-fit">
          <h2 className="font-bold text-brand-800 mb-1">เพิ่มประเภทใหม่</h2>
          <p className="text-xs text-brand-900/50 mb-4">จะต่อท้ายลำดับปัจจุบัน (ลำดับที่ {catalog.length + 1})</p>
          <form action={createSensorType} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-brand-900/70">ชื่อ (Label)</label>
              <input
                name="label"
                required
                placeholder="เช่น Soil Moisture"
                className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-brand-900/70">Icon</label>
              <div className="mt-1">
                <IconPicker name="icon" defaultValue="📊" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-brand-900/70">หน่วยวัด (Default Unit)</label>
              <input
                name="unit"
                placeholder="เช่น %"
                className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2.5 text-sm transition"
            >
              + เพิ่มประเภท Sensor
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
