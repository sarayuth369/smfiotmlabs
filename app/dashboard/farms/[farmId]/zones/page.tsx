import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatThaiDate } from "@/lib/payment";
import { canCreateZone } from "@/lib/plan-limits";
import { UsageBar } from "../../_components/UsageBar";
import { PlanLimitNotice } from "../../_components/PlanLimitNotice";
import { ArchiveZoneButton, RestoreZoneButton } from "./_components/ZoneArchiveButtons";

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
};

export default async function FarmZonesPage({
  params,
  searchParams,
}: {
  params: Promise<{ farmId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { farmId } = await params;
  const sp = await searchParams;
  const view = sp.status === "archived" ? "archived" : "active";

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

  let listQuery = supabase
    .from("zones")
    .select("id, farm_id, name, description, area, area_unit, crop_type, planting_date, expected_harvest_date, archived_at, created_at")
    .eq("farm_id", farmId)
    .order("created_at", { ascending: false });
  listQuery = view === "archived"
    ? listQuery.not("archived_at", "is", null)
    : listQuery.is("archived_at", null);

  const [{ data }, check, archivedCountRes] = await Promise.all([
    listQuery,
    canCreateZone(supabase, user!.id),
    supabase
      .from("zones")
      .select("id", { count: "exact", head: true })
      .eq("farm_id", farmId)
      .not("archived_at", "is", null),
  ]);

  const zones = (data ?? []) as Zone[];
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
      เพิ่มแปลง
    </div>
  ) : (
    <Link href={`/dashboard/farms/${farmId}/zones/new`} className={addBtnClasses}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
      เพิ่มแปลง
    </Link>
  );

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href={`/dashboard/farms/${farmId}`} className="hover:text-brand-900">
          ← {farm.name}
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-800">แปลง / Zone</h1>
          <p className="text-sm text-brand-900/60 mt-1">
            จัดการแปลงปลูกภายในฟาร์ม <span className="font-semibold">{farm.name}</span>
          </p>
        </div>
        {view === "active" && addBtn}
      </div>

      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-brand-800">
            การใช้งานแปลงในแพ็กเกจ <span className="uppercase">{check.planName}</span>
          </div>
          <Link href="/pricing" className="text-xs text-brand-700 hover:text-brand-900 font-medium underline">
            ดูแพ็กเกจ
          </Link>
        </div>
        <UsageBar label="แปลง (Active — รวมทุกฟาร์ม)" current={check.current} limit={check.limit} />
      </div>

      {atLimit && view === "active" && (
        <div className="mb-6">
          <PlanLimitNotice
            planName={check.planName}
            current={check.current}
            limit={check.limit ?? 0}
            entity="แปลง"
          />
        </div>
      )}

      <div className="mb-6 border-b border-brand-100 flex items-center gap-1">
        <TabLink
          label={`ใช้งาน (${zones.filter((z) => !z.archived_at).length + (view === "archived" ? 0 : 0)})`}
          active={view === "active"}
          href={`/dashboard/farms/${farmId}/zones`}
        />
        <TabLink
          label={`ที่เก็บถาวร (${archivedCount})`}
          active={view === "archived"}
          href={`/dashboard/farms/${farmId}/zones?status=archived`}
        />
      </div>

      {zones.length === 0 ? (
        <div className="card p-10 sm:p-16 text-center">
          <div className="text-5xl">{view === "archived" ? "📦" : "🌾"}</div>
          <div className="mt-4 text-lg font-bold text-brand-800">
            {view === "archived" ? "ยังไม่มีแปลงที่ถูกเก็บถาวร" : "ยังไม่มีแปลงปลูก"}
          </div>
          {view === "active" && (
            <>
              <p className="mt-2 text-sm text-brand-900/60">
                เพิ่มแปลงแรกของคุณเพื่อเริ่มจัดการพื้นที่การเกษตร
              </p>
              <div className="mt-6 inline-flex">{addBtn}</div>
            </>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {zones.map((z) => {
            const areaLabel =
              z.area !== null ? `${Number(z.area).toLocaleString()} ${z.area_unit ?? "ไร่"}` : null;
            const isArchived = !!z.archived_at;

            return (
              <div
                key={z.id}
                className={`card p-5 sm:p-6 flex flex-col ${isArchived ? "opacity-75" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-lg font-bold text-brand-800">🌱 {z.name}</div>
                    {z.crop_type && (
                      <div className="text-xs text-brand-900/70 mt-0.5">{z.crop_type}</div>
                    )}
                  </div>
                  {isArchived ? (
                    <div className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-brand-100 text-brand-700/80">
                      Archived
                    </div>
                  ) : (
                    <div className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-green-100 text-green-800">
                      Active
                    </div>
                  )}
                </div>

                {z.description && (
                  <p className="mt-3 text-sm text-brand-900/70 line-clamp-2">{z.description}</p>
                )}

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-brand-900/55">พื้นที่</dt>
                    <dd className="font-semibold text-brand-800">{areaLabel ?? "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-brand-900/55">วันที่ปลูก</dt>
                    <dd className="font-semibold text-brand-800">
                      {z.planting_date ? formatThaiDate(z.planting_date) : "-"}
                    </dd>
                  </div>
                  {z.expected_harvest_date && (
                    <div className="col-span-2">
                      <dt className="text-xs text-brand-900/55">คาดว่าเก็บเกี่ยว</dt>
                      <dd className="font-semibold text-brand-800">{formatThaiDate(z.expected_harvest_date)}</dd>
                    </div>
                  )}
                </dl>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  {!isArchived && (
                    <>
                      <Link
                        href={`/dashboard/farms/${farmId}/zones/${z.id}`}
                        className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-4 py-2 transition"
                      >
                        เปิดแปลง
                      </Link>
                      <Link
                        href={`/dashboard/farms/${farmId}/zones/${z.id}/edit`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 hover:border-brand-400 text-brand-800 text-xs font-semibold px-4 py-2 transition"
                      >
                        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                        แก้ไข
                      </Link>
                      <ArchiveZoneButton farmId={farmId} zoneId={z.id} zoneName={z.name} />
                    </>
                  )}
                  {isArchived && (
                    <RestoreZoneButton
                      farmId={farmId}
                      zoneId={z.id}
                      zoneName={z.name}
                      canRestore={check.ok}
                    />
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
