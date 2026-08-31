import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canCreateNode } from "@/lib/plan-limits";
import { UsageBar } from "../../_components/UsageBar";
import { PlanLimitNotice } from "../../_components/PlanLimitNotice";
import { DeviceCard, type DeviceRow } from "../../../devices/_components/DeviceCard";

export default async function FarmDevicesPage({
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

  let q = supabase
    .from("iot_nodes")
    .select("id, device_uid, device_name, farm_id, zone_id, device_type, model, status, firmware_version, last_seen, archived_at, created_at, zones(name)")
    .eq("farm_id", farmId)
    .order("created_at", { ascending: false });
  q = view === "archived" ? q.not("archived_at", "is", null) : q.is("archived_at", null);

  const [{ data }, check, archivedRes] = await Promise.all([
    q,
    canCreateNode(supabase, user!.id),
    supabase
      .from("iot_nodes")
      .select("id", { count: "exact", head: true })
      .eq("farm_id", farmId)
      .not("archived_at", "is", null),
  ]);
  const archivedCount = archivedRes.count ?? 0;

  const list: DeviceRow[] = (data ?? []).map((r) => {
    const zoneRel = r.zones as { name: string } | { name: string }[] | null;
    const zone_name = Array.isArray(zoneRel) ? zoneRel[0]?.name ?? null : zoneRel?.name ?? null;
    return {
      ...(r as Omit<DeviceRow, "farm_name" | "zone_name">),
      farm_name: farm.name,
      zone_name,
    } as DeviceRow;
  });

  const atLimit = !check.ok;
  const addBtnClasses = atLimit
    ? "inline-flex items-center gap-1.5 rounded-full bg-brand-100 text-brand-700/60 font-semibold px-5 py-2.5 text-sm cursor-not-allowed"
    : "inline-flex items-center gap-1.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2.5 text-sm transition";
  const addBtn = atLimit ? (
    <div className={addBtnClasses} title={check.reason}>+ เพิ่มอุปกรณ์</div>
  ) : (
    <Link
      href={`/dashboard/devices/new?farm_id=${farmId}`}
      className={addBtnClasses}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
      เพิ่มอุปกรณ์
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
          <h1 className="text-2xl font-bold text-brand-800">อุปกรณ์ IoT</h1>
          <p className="text-sm text-brand-900/60 mt-1">
            SMF IoT Node ในฟาร์ม <span className="font-semibold">{farm.name}</span>
          </p>
          <Link href={`/dashboard/device-health?farm=${farmId}`} className="inline-flex items-center gap-1 text-sm text-brand-700 hover:text-brand-900 underline mt-1">
            สุขภาพอุปกรณ์ →
          </Link>
        </div>
        {view === "active" && addBtn}
      </div>

      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-brand-800">
            การใช้งานอุปกรณ์ในแพ็กเกจ <span className="uppercase">{check.planName}</span>
          </div>
          <Link href="/pricing" className="text-xs text-brand-700 hover:text-brand-900 font-medium underline">
            ดูแพ็กเกจ
          </Link>
        </div>
        <UsageBar
          label="IoT Nodes (Active — รวมทุกฟาร์ม)"
          current={check.current}
          limit={check.limit}
        />
      </div>

      {atLimit && view === "active" && (
        <div className="mb-6">
          <PlanLimitNotice
            planName={check.planName}
            current={check.current}
            limit={check.limit ?? 0}
            entity="อุปกรณ์"
          />
        </div>
      )}

      <div className="mb-6 border-b border-brand-100 flex items-center gap-1">
        <TabLink
          label={`ใช้งาน (${list.filter((d) => !d.archived_at).length})`}
          active={view === "active"}
          href={`/dashboard/farms/${farmId}/devices`}
        />
        <TabLink
          label={`ที่เก็บถาวร (${archivedCount})`}
          active={view === "archived"}
          href={`/dashboard/farms/${farmId}/devices?status=archived`}
        />
      </div>

      {list.length === 0 ? (
        <div className="card p-10 sm:p-16 text-center">
          <div className="text-5xl">{view === "archived" ? "📦" : "📡"}</div>
          <div className="mt-4 text-lg font-bold text-brand-800">
            {view === "archived" ? "ยังไม่มีอุปกรณ์ที่ถูกเก็บถาวร" : "ยังไม่มีอุปกรณ์ในฟาร์มนี้"}
          </div>
          {view === "active" && (
            <>
              <p className="mt-2 text-sm text-brand-900/60">
                เพิ่ม SMF IoT Node เพื่อเริ่มเก็บข้อมูล
              </p>
              <div className="mt-6 inline-flex">{addBtn}</div>
            </>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {list.map((d) => (
            <DeviceCard key={d.id} device={d} canRestore={check.ok} showFarmLink={false} />
          ))}
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
