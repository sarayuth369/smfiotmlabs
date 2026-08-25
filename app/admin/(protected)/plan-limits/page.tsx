import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";
import { KNOWN_FEATURES } from "@/lib/plan-limits";
import { updatePlanLimits } from "./actions";
import { LimitInput } from "./_components/LimitInput";

type PlanRow = {
  plan_id: "starter" | "pro" | "business" | "enterprise";
  name: string;
  price: number;
  price_note: string | null;
  max_farms: number | null;
  max_zones: number | null;
  max_nodes: number | null;
  max_sensors: number | null;
  max_relays: number | null;
  sensor_history_days: number | null;
  entitlements: Record<string, boolean> | null;
  sort_order: number;
  is_active: boolean;
};

const PLAN_ORDER = ["starter", "pro", "business", "enterprise"] as const;

export default async function PlanLimitsPage() {
  await requireModule("plan_limits");
  const admin = createAdminClient();

  const { data } = await admin
    .from("subscription_plans")
    .select("plan_id, name, price, price_note, max_farms, max_zones, max_nodes, max_sensors, max_relays, sensor_history_days, entitlements, sort_order, is_active")
    .in("plan_id", PLAN_ORDER as unknown as string[]);

  const rows = (data ?? []) as PlanRow[];
  const byId = new Map(rows.map((r) => [r.plan_id, r]));
  const ordered = PLAN_ORDER.map((id) => byId.get(id)).filter(Boolean) as PlanRow[];

  return (
    <div>
      <div className="mb-6">
        <div className="text-xs text-brand-700/70 font-medium">การตั้งค่า</div>
        <h1 className="text-2xl font-bold text-brand-800">Plan Limits &amp; Features</h1>
        <p className="text-sm text-brand-900/60 mt-1">
          กำหนดสิทธิ์และข้อจำกัดของแต่ละแพ็กเกจ — ค่าที่บันทึกจะบังคับใช้ทันทีเมื่อ user โหลดหน้าใหม่
        </p>
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-900">
          <strong>ปลอดภัย:</strong> การลด limit จะไม่ลบข้อมูลของลูกค้า — ระบบจะแสดง Over Limit
          และบล็อกการสร้างเพิ่มจนกว่าลูกค้าจะกลับมาอยู่ในโควตา
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {ordered.map((p) => {
          const ent = p.entitlements ?? {};
          const bound = updatePlanLimits.bind(null, p.plan_id);
          return (
            <form key={p.plan_id} action={bound} className="card p-6 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-brand-700/70 font-medium uppercase tracking-wider">
                    {p.plan_id}
                  </div>
                  <div className="text-xl font-bold text-brand-800">{p.name}</div>
                  <div className="text-sm text-brand-900/60">
                    {p.price === 0 && !p.price_note ? "ฟรี" : `฿${p.price.toLocaleString()} ${p.price_note ?? ""}`}
                  </div>
                </div>
                {!p.is_active && (
                  <div className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-brand-100 text-brand-700/70">
                    Inactive
                  </div>
                )}
              </div>

              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-brand-900/60 mb-3">
                  Resource Limits
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <LimitInput name="max_farms" label="Max Farms" initial={p.max_farms} />
                  <LimitInput name="max_zones" label="Max Zones" initial={p.max_zones} />
                  <LimitInput name="max_nodes" label="Max IoT Devices" initial={p.max_nodes} />
                  <LimitInput name="max_sensors" label="Max Sensors" initial={p.max_sensors} />
                  <LimitInput name="max_relays" label="Max Relays" initial={p.max_relays} />
                </div>
                <div className="mt-4">
                  <LimitInput
                    name="sensor_history_days"
                    label="Sensor History"
                    initial={p.sensor_history_days}
                    suffix="วัน"
                    min={1}
                  />
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <div className="text-xs font-bold uppercase tracking-wider text-brand-900/60 mb-3">
                  Feature Flags
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {KNOWN_FEATURES.map((f) => (
                    <label
                      key={f.key}
                      className="flex items-center gap-2 rounded-lg border border-border hover:border-brand-300 px-3 py-2 text-sm text-brand-900/85 cursor-pointer transition"
                    >
                      <input
                        type="checkbox"
                        name={`feat__${f.key}`}
                        defaultChecked={!!ent[f.key]}
                        className="rounded border-border text-brand-600 focus:ring-brand-500/30"
                      />
                      {f.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end border-t border-border pt-4">
                <button
                  type="submit"
                  className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2 text-sm transition"
                >
                  บันทึก
                </button>
              </div>
            </form>
          );
        })}
      </div>
    </div>
  );
}
