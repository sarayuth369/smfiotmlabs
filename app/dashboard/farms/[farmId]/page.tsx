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

type SubnavItem = { key: string; label: string; href?: string; soon?: boolean };

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

  // Fetch active device ids for this farm first (needed for sensor count join)
  const { data: farmDeviceRows } = await supabase
    .from("iot_nodes")
    .select("id")
    .eq("farm_id", farmId)
    .is("archived_at", null);
  const farmDeviceIds = (farmDeviceRows ?? []).map((r) => r.id as string);
  const sensorCountRes = farmDeviceIds.length
    ? await supabase
        .from("sensors")
        .select("id", { count: "exact", head: true })
        .in("device_id", farmDeviceIds)
        .is("archived_at", null)
    : { count: 0 };
  const sensorsActive = sensorCountRes.count ?? 0;

  const [zoneActiveRes, zoneArchivedRes, deviceActiveRes] = await Promise.all([
    supabase
      .from("zones")
      .select("id", { count: "exact", head: true })
      .eq("farm_id", farmId)
      .is("archived_at", null),
    supabase
      .from("zones")
      .select("id", { count: "exact", head: true })
      .eq("farm_id", farmId)
      .not("archived_at", "is", null),
    supabase
      .from("iot_nodes")
      .select("id", { count: "exact", head: true })
      .eq("farm_id", farmId)
      .is("archived_at", null),
  ]);
  const zonesActive = zoneActiveRes.count ?? 0;
  const zonesArchived = zoneArchivedRes.count ?? 0;
  const devicesActive = deviceActiveRes.count ?? 0;

  const SUBNAV: SubnavItem[] = [
    { key: "overview", label: "ภาพรวม" }, // current page
    { key: "zones", label: "แปลง / Zone", href: `/dashboard/farms/${farmId}/zones` },
    { key: "nodes", label: "อุปกรณ์ IoT", href: `/dashboard/farms/${farmId}/devices` },
    { key: "sensors", label: "Sensors", href: `/dashboard/farms/${farmId}/sensors` },
    { key: "controls", label: "Controls", href: `/dashboard/farms/${farmId}/controls` },
    { key: "automation", label: "Automation", href: `/dashboard/farms/${farmId}/automation` },
    { key: "notifications", label: "การแจ้งเตือน", href: `/dashboard/farms/${farmId}/notifications` },
    { key: "api", label: "API Access", href: `/dashboard/api-access` },
    { key: "ai", label: "AI Analysis", href: `/dashboard/ai-analysis` },
    { key: "reports", label: "รายงาน", href: `/dashboard/farms/${farmId}/reports` },
  ];

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

      {/* Sub-nav */}
      <div className="border-b border-brand-100 mb-6 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {SUBNAV.map((n) => {
            const isActive = n.key === "overview";
            if (n.href) {
              return (
                <Link
                  key={n.key}
                  href={n.href}
                  className="px-4 py-2.5 text-sm font-medium whitespace-nowrap text-brand-900/70 hover:text-brand-800 transition"
                >
                  {n.label}
                </Link>
              );
            }
            return (
              <div
                key={n.key}
                className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap ${
                  isActive ? "text-brand-800 border-b-2 border-brand-600" : "text-brand-900/40"
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
            );
          })}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        <div className="card p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-100 text-green-700 flex items-center justify-center text-2xl">
              🌱
            </div>
            <div>
              <div className="text-xs text-brand-900/55">แปลงในฟาร์มนี้</div>
              <div className="text-2xl font-bold text-brand-800">
                {zonesActive}{" "}
                <span className="text-sm font-normal text-brand-900/55">
                  Active{zonesArchived > 0 && ` • ${zonesArchived} Archived`}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/dashboard/farms/${farmId}/zones/new`}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-3.5 py-2 transition"
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              เพิ่มแปลง
            </Link>
            <Link
              href={`/dashboard/farms/${farmId}/zones`}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 hover:border-brand-400 text-brand-800 text-xs font-semibold px-3.5 py-2 transition"
            >
              จัดการ
            </Link>
          </div>
        </div>

        <div className="card p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center text-2xl">
              📡
            </div>
            <div>
              <div className="text-xs text-brand-900/55">อุปกรณ์ IoT ในฟาร์มนี้</div>
              <div className="text-2xl font-bold text-brand-800">
                {devicesActive}{" "}
                <span className="text-sm font-normal text-brand-900/55">
                  Devices • {sensorsActive} Sensors
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/dashboard/devices/new?farm_id=${farmId}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-3.5 py-2 transition"
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              เพิ่มอุปกรณ์
            </Link>
            <Link
              href={`/dashboard/farms/${farmId}/devices`}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 hover:border-brand-400 text-brand-800 text-xs font-semibold px-3.5 py-2 transition"
            >
              จัดการ
            </Link>
          </div>
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
                  <dd className="mt-0.5">
                    <a
                      href={`https://www.google.com/maps?q=${farm.latitude},${farm.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-mono text-sm text-brand-800 hover:text-brand-600 transition"
                      title="เปิดใน Google Maps"
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      {coords}
                    </a>
                  </dd>
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
