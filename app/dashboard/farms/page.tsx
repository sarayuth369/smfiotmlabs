import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatThaiDate } from "@/lib/payment";
import { canCreateFarm } from "@/lib/plan-limits";
import { UsageBar } from "./_components/UsageBar";
import { PlanLimitNotice } from "./_components/PlanLimitNotice";
import { ArchiveFarmButton, RestoreFarmButton } from "./_components/ArchiveButtons";

type Farm = {
  id: string;
  name: string;
  description: string | null;
  province: string | null;
  district: string | null;
  area: number | null;
  area_unit: string | null;
  farm_type: string | null;
  created_at: string;
  archived_at: string | null;
};

export default async function MyFarmsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const view = params.status === "archived" ? "archived" : "active";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let listQuery = supabase
    .from("farms")
    .select("id, name, description, province, district, area, area_unit, farm_type, created_at, archived_at")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });
  listQuery = view === "archived"
    ? listQuery.not("archived_at", "is", null)
    : listQuery.is("archived_at", null);

  const [{ data }, check, archivedCountRes] = await Promise.all([
    listQuery,
    canCreateFarm(supabase, user!.id),
    supabase
      .from("farms")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user!.id)
      .not("archived_at", "is", null),
  ]);

  const farms = (data ?? []) as Farm[];
  const archivedCount = archivedCountRes.count ?? 0;
  const atLimit = !check.ok;

  const addBtnClasses = atLimit
    ? "inline-flex items-center gap-1.5 rounded-full bg-brand-100 text-brand-700/60 font-semibold px-5 py-2.5 text-sm cursor-not-allowed"
    : "inline-flex items-center gap-1.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2.5 text-sm transition";

  const addBtn = atLimit ? (
    <div className={addBtnClasses} title={check.reason}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
      เพิ่มฟาร์ม
    </div>
  ) : (
    <Link href="/dashboard/farms/new" className={addBtnClasses}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
      เพิ่มฟาร์ม
    </Link>
  );

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href="/dashboard" className="hover:text-brand-900">← Dashboard</Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-800">ฟาร์มของฉัน</h1>
          <p className="text-sm text-brand-900/60 mt-1">
            จัดการฟาร์ม แปลง และอุปกรณ์ IoT ของคุณ
          </p>
        </div>
        {view === "active" && addBtn}
      </div>

      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-brand-800">
            การใช้งานแพ็กเกจ <span className="uppercase">{check.planName}</span>
          </div>
          <Link href="/pricing" className="text-xs text-brand-700 hover:text-brand-900 font-medium underline">
            ดูแพ็กเกจ
          </Link>
        </div>
        <UsageBar label="ฟาร์ม (Active)" current={check.current} limit={check.limit} />
      </div>

      {atLimit && view === "active" && (
        <div className="mb-6">
          <PlanLimitNotice planName={check.planName} current={check.current} limit={check.limit ?? 0} />
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 border-b border-brand-100 flex items-center gap-1">
        <TabLink label={`ใช้งาน (${check.current})`} active={view === "active"} href="/dashboard/farms" />
        <TabLink label={`ที่เก็บถาวร (${archivedCount})`} active={view === "archived"} href="/dashboard/farms?status=archived" />
      </div>

      {farms.length === 0 ? (
        <div className="card p-10 sm:p-16 text-center">
          <div className="text-5xl">{view === "archived" ? "📦" : "🌱"}</div>
          <div className="mt-4 text-lg font-bold text-brand-800">
            {view === "archived" ? "ยังไม่มีฟาร์มที่ถูกเก็บถาวร" : "คุณยังไม่มีฟาร์ม"}
          </div>
          {view === "active" && (
            <>
              <p className="mt-2 text-sm text-brand-900/60">
                เริ่มต้นสร้างฟาร์มแรกของคุณเพื่อจัดการแปลงปลูกและอุปกรณ์ IoT
              </p>
              <div className="mt-6 inline-flex">{addBtn}</div>
            </>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {farms.map((f) => {
            const location = [f.province, f.district].filter(Boolean).join(" • ") || "ไม่ระบุที่ตั้ง";
            const areaLabel =
              f.area !== null ? `${Number(f.area).toLocaleString()} ${f.area_unit ?? "ไร่"}` : null;
            const isArchived = !!f.archived_at;

            return (
              <div
                key={f.id}
                className={`card p-5 sm:p-6 flex flex-col ${isArchived ? "opacity-75" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-lg font-bold text-brand-800">{f.name}</div>
                    <div className="text-xs text-brand-900/55 mt-0.5">{location}</div>
                  </div>
                  {isArchived ? (
                    <div className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-brand-100 text-brand-700/80">
                      Archived
                    </div>
                  ) : (
                    f.farm_type && (
                      <div className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-brand-100 text-brand-700">
                        {f.farm_type}
                      </div>
                    )
                  )}
                </div>

                {f.description && (
                  <p className="mt-3 text-sm text-brand-900/70 line-clamp-2">{f.description}</p>
                )}

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-brand-900/55">พื้นที่</div>
                    <div className="font-semibold text-brand-800">{areaLabel ?? "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-brand-900/55">
                      {isArchived ? "เก็บเมื่อ" : "สร้างเมื่อ"}
                    </div>
                    <div className="font-semibold text-brand-800">
                      {formatThaiDate(isArchived ? f.archived_at! : f.created_at)}
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  {!isArchived && (
                    <>
                      <Link
                        href={`/dashboard/farms/${f.id}`}
                        className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-4 py-2 transition"
                      >
                        เปิดฟาร์ม
                      </Link>
                      <Link
                        href={`/dashboard/farms/${f.id}/edit`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 hover:border-brand-400 text-brand-800 text-xs font-semibold px-4 py-2 transition"
                      >
                        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                        ตั้งค่า
                      </Link>
                      <ArchiveFarmButton farmId={f.id} farmName={f.name} />
                    </>
                  )}
                  {isArchived && (
                    <RestoreFarmButton farmId={f.id} farmName={f.name} canRestore={check.ok} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TabLink({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition ${
        active
          ? "text-brand-800 border-b-2 border-brand-600"
          : "text-brand-900/55 hover:text-brand-800"
      }`}
    >
      {label}
    </Link>
  );
}
