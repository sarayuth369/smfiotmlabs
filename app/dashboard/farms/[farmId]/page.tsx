import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatThaiDate } from "@/lib/payment";

type Farm = {
  id: string;
  name: string;
  description: string | null;
  province: string | null;
  district: string | null;
  subdistrict: string | null;
  area: number | null;
  area_unit: string | null;
  farm_type: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

const SUBNAV = [
  { key: "overview", label: "ภาพรวม", active: true },
  { key: "zones", label: "แปลง / Zone", soon: true },
  { key: "nodes", label: "อุปกรณ์ IoT", soon: true },
  { key: "sensors", label: "Sensors", soon: true },
  { key: "automation", label: "Automation", soon: true },
  { key: "notifications", label: "การแจ้งเตือน", soon: true },
  { key: "reports", label: "รายงาน", soon: true },
];

export default async function FarmDetailPage({
  params,
}: {
  params: Promise<{ farmId: string }>;
}) {
  const { farmId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("farms")
    .select(
      "id, name, description, province, district, subdistrict, area, area_unit, farm_type, latitude, longitude, created_at, updated_at, archived_at"
    )
    .eq("id", farmId)
    .eq("user_id", user!.id)
    .maybeSingle();

  const farm = data as Farm | null;
  if (!farm) notFound();

  const location = [farm.subdistrict, farm.district, farm.province].filter(Boolean).join(" • ") || "ไม่ระบุที่ตั้ง";
  const areaLabel =
    farm.area !== null ? `${Number(farm.area).toLocaleString()} ${farm.area_unit ?? "ไร่"}` : "ไม่ระบุ";
  const coords =
    farm.latitude !== null && farm.longitude !== null
      ? `${Number(farm.latitude).toFixed(6)}, ${Number(farm.longitude).toFixed(6)}`
      : null;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href="/dashboard/farms" className="hover:text-brand-900">← ฟาร์มของฉัน</Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-800">{farm.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-brand-900/60">
            <span>{location}</span>
            {farm.farm_type && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-brand-100 text-brand-700">
                {farm.farm_type}
              </span>
            )}
            {farm.archived_at && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                Archived
              </span>
            )}
          </div>
        </div>
        <Link
          href={`/dashboard/farms/${farm.id}/edit`}
          className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 hover:border-brand-400 text-brand-800 font-semibold px-4 py-2 text-sm transition"
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          ตั้งค่าฟาร์ม
        </Link>
      </div>

      {/* Sub-nav (Overview active, others Coming Soon) */}
      <div className="border-b border-brand-100 mb-6 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {SUBNAV.map((n) => (
            <div
              key={n.key}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap ${
                n.active
                  ? "text-brand-800 border-b-2 border-brand-600"
                  : "text-brand-900/40"
              }`}
              title={n.soon ? "เร็ว ๆ นี้" : undefined}
            >
              {n.label}
              {n.soon && (
                <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-50 text-brand-600 align-middle">
                  Soon
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Overview */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <div className="card p-6">
            <h2 className="font-bold text-brand-800 mb-3">ข้อมูลฟาร์ม</h2>
            <dl className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-brand-900/55">ชื่อฟาร์ม</dt>
                <dd className="font-semibold text-brand-800 mt-0.5">{farm.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-brand-900/55">ประเภท</dt>
                <dd className="font-semibold text-brand-800 mt-0.5">{farm.farm_type ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-xs text-brand-900/55">พื้นที่</dt>
                <dd className="font-semibold text-brand-800 mt-0.5">{areaLabel}</dd>
              </div>
              <div>
                <dt className="text-xs text-brand-900/55">ที่ตั้ง</dt>
                <dd className="font-semibold text-brand-800 mt-0.5">{location}</dd>
              </div>
              {coords && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-brand-900/55">พิกัด</dt>
                  <dd className="font-mono text-sm text-brand-800 mt-0.5">{coords}</dd>
                </div>
              )}
              {farm.description && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-brand-900/55">รายละเอียด</dt>
                  <dd className="text-brand-900/85 mt-0.5 whitespace-pre-wrap">{farm.description}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="card p-6">
            <h2 className="font-bold text-brand-800">ขั้นตอนถัดไป</h2>
            <ol className="mt-3 space-y-2 text-sm text-brand-900/80 list-decimal pl-5">
              <li>เพิ่ม <span className="font-semibold">แปลง (Zone)</span> ในฟาร์ม — เร็ว ๆ นี้</li>
              <li>ผูก <span className="font-semibold">SMF IoT Node</span> เข้ากับแปลง — เร็ว ๆ นี้</li>
              <li>ตั้งค่า <span className="font-semibold">การแจ้งเตือน</span> และ <span className="font-semibold">Automation</span> — เร็ว ๆ นี้</li>
            </ol>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="card p-5">
            <div className="text-xs text-brand-900/55">สร้างเมื่อ</div>
            <div className="font-semibold text-brand-800">{formatThaiDate(farm.created_at)}</div>
          </div>
          <div className="card p-5">
            <div className="text-xs text-brand-900/55">แก้ไขล่าสุด</div>
            <div className="font-semibold text-brand-800">{formatThaiDate(farm.updated_at)}</div>
          </div>
          <div className="card p-5">
            <div className="text-xs text-brand-900/55">รหัสฟาร์ม</div>
            <div className="font-mono text-xs text-brand-800 break-all mt-0.5">{farm.id}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
