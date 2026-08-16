import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatThaiDate } from "@/lib/payment";

type Zone = {
  id: string;
  farm_id: string;
  name: string;
  description: string | null;
  area: number | null;
  area_unit: string | null;
  crop_type: string | null;
  planting_date: string | null;
  expected_harvest_date: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export default async function ZoneDetailPage({
  params,
}: {
  params: Promise<{ farmId: string; zoneId: string }>;
}) {
  const { farmId, zoneId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: farm } = await supabase
    .from("farms")
    .select("id, name")
    .eq("id", farmId)
    .eq("user_id", user!.id)
    .maybeSingle();
  if (!farm) notFound();

  const { data } = await supabase
    .from("zones")
    .select("id, farm_id, name, description, area, area_unit, crop_type, planting_date, expected_harvest_date, archived_at, created_at, updated_at")
    .eq("id", zoneId)
    .eq("farm_id", farmId)
    .maybeSingle();
  const zone = data as Zone | null;
  if (!zone) notFound();

  const areaLabel =
    zone.area !== null ? `${Number(zone.area).toLocaleString()} ${zone.area_unit ?? "ไร่"}` : "ไม่ระบุ";
  const isArchived = !!zone.archived_at;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href={`/dashboard/farms/${farmId}/zones`} className="hover:text-brand-900">
          ← แปลง / Zone ({farm.name})
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-800">🌱 {zone.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-brand-900/60">
            {zone.crop_type && <span>{zone.crop_type}</span>}
            {isArchived ? (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                Archived
              </span>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-green-100 text-green-800">
                Active
              </span>
            )}
          </div>
        </div>
        <Link
          href={`/dashboard/farms/${farmId}/zones/${zoneId}/edit`}
          className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 hover:border-brand-400 text-brand-800 font-semibold px-4 py-2 text-sm transition"
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          แก้ไขแปลง
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <div className="card p-6">
            <h2 className="font-bold text-brand-800 mb-3">ข้อมูลแปลง</h2>
            <dl className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-brand-900/55">ฟาร์ม</dt>
                <dd className="font-semibold text-brand-800 mt-0.5">
                  <Link href={`/dashboard/farms/${farmId}`} className="hover:text-brand-600">
                    {farm.name}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-brand-900/55">พืชที่ปลูก</dt>
                <dd className="font-semibold text-brand-800 mt-0.5">{zone.crop_type ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-xs text-brand-900/55">พื้นที่</dt>
                <dd className="font-semibold text-brand-800 mt-0.5">{areaLabel}</dd>
              </div>
              <div>
                <dt className="text-xs text-brand-900/55">วันที่ปลูก</dt>
                <dd className="font-semibold text-brand-800 mt-0.5">
                  {zone.planting_date ? formatThaiDate(zone.planting_date) : "-"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-brand-900/55">คาดว่าเก็บเกี่ยว</dt>
                <dd className="font-semibold text-brand-800 mt-0.5">
                  {zone.expected_harvest_date ? formatThaiDate(zone.expected_harvest_date) : "-"}
                </dd>
              </div>
              {zone.description && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-brand-900/55">รายละเอียด</dt>
                  <dd className="text-brand-900/85 mt-0.5 whitespace-pre-wrap">{zone.description}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="card p-6">
            <h2 className="font-bold text-brand-800">อุปกรณ์ IoT ในแปลง</h2>
            <div className="mt-4 rounded-xl border border-dashed border-brand-200 p-6 text-center text-sm text-brand-900/55">
              <div className="text-3xl">📡</div>
              <div className="mt-2 font-semibold text-brand-800">Coming Soon</div>
              <div className="mt-1">ระบบ IoT Node / Sensor / Realtime จะเปิดใช้งานในเฟสถัดไป</div>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="card p-5">
            <div className="text-xs text-brand-900/55">สร้างเมื่อ</div>
            <div className="font-semibold text-brand-800">{formatThaiDate(zone.created_at)}</div>
          </div>
          <div className="card p-5">
            <div className="text-xs text-brand-900/55">แก้ไขล่าสุด</div>
            <div className="font-semibold text-brand-800">{formatThaiDate(zone.updated_at)}</div>
          </div>
          <div className="card p-5">
            <div className="text-xs text-brand-900/55">รหัสแปลง</div>
            <div className="font-mono text-xs text-brand-800 break-all mt-0.5">{zone.id}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
