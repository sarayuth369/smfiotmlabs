import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { canCreateNode } from "@/lib/plan-limits";
import { UsageBar } from "../farms/_components/UsageBar";
import { PlanLimitNotice } from "../farms/_components/PlanLimitNotice";
import { DeviceCard, type DeviceRow } from "./_components/DeviceCard";

export default async function DevicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const view = sp.status === "archived" ? "archived" : "active";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch user's farms (also used to filter devices by user via farm_id)
  const { data: farms } = await supabase
    .from("farms")
    .select("id, name")
    .eq("user_id", user!.id);
  const farmIds = (farms ?? []).map((f) => f.id as string);
  const farmMap = new Map((farms ?? []).map((f) => [f.id as string, f.name as string]));

  let list: DeviceRow[] = [];
  let archivedCount = 0;

  if (farmIds.length > 0) {
    let q = supabase
      .from("iot_nodes")
      .select("id, device_uid, device_name, farm_id, zone_id, device_type, model, status, firmware_version, last_seen, archived_at, created_at, zones(name)")
      .in("farm_id", farmIds)
      .order("created_at", { ascending: false });
    q = view === "archived" ? q.not("archived_at", "is", null) : q.is("archived_at", null);

    const [{ data }, archivedRes] = await Promise.all([
      q,
      supabase
        .from("iot_nodes")
        .select("id", { count: "exact", head: true })
        .in("farm_id", farmIds)
        .not("archived_at", "is", null),
    ]);
    archivedCount = archivedRes.count ?? 0;

    list = (data ?? []).map((r) => {
      const zoneRel = r.zones as { name: string } | { name: string }[] | null;
      const zone_name = Array.isArray(zoneRel) ? zoneRel[0]?.name ?? null : zoneRel?.name ?? null;
      return {
        ...(r as Omit<DeviceRow, "farm_name" | "zone_name">),
        farm_name: farmMap.get(r.farm_id as string) ?? null,
        zone_name,
      } as DeviceRow;
    });
  }

  const check = await canCreateNode(supabase, user!.id);
  const atLimit = !check.ok;
  const canAdd = farms && farms.length > 0 && !atLimit;

  const addBtnClasses = !canAdd
    ? "inline-flex items-center gap-1.5 rounded-full bg-brand-100 text-brand-700/60 font-semibold px-5 py-2.5 text-sm cursor-not-allowed"
    : "inline-flex items-center gap-1.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2.5 text-sm transition";

  const addBtn = canAdd ? (
    <Link href="/dashboard/devices/new" className={addBtnClasses}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
      เพิ่มอุปกรณ์
    </Link>
  ) : (
    <div
      className={addBtnClasses}
      title={farms && farms.length === 0 ? "ต้องมีฟาร์มก่อนเพิ่มอุปกรณ์" : check.reason}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
      เพิ่มอุปกรณ์
    </div>
  );

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href="/dashboard" className="hover:text-brand-900">← Dashboard</Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-800">อุปกรณ์ IoT ทั้งหมด</h1>
          <p className="text-sm text-brand-900/60 mt-1">
            SMF IoT Node ทุกตัวในทุกฟาร์มของคุณ
          </p>
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
        <UsageBar label="IoT Nodes (Active — รวมทุกฟาร์ม)" current={check.current} limit={check.limit} />
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
          label={`ใช้งาน (${check.current})`}
          active={view === "active"}
          href="/dashboard/devices"
        />
        <TabLink
          label={`ที่เก็บถาวร (${archivedCount})`}
          active={view === "archived"}
          href="/dashboard/devices?status=archived"
        />
      </div>

      {list.length === 0 ? (
        <div className="card p-10 sm:p-16 text-center">
          <div className="text-5xl">{view === "archived" ? "📦" : "📡"}</div>
          <div className="mt-4 text-lg font-bold text-brand-800">
            {view === "archived" ? "ยังไม่มีอุปกรณ์ที่ถูกเก็บถาวร" : "ยังไม่มีอุปกรณ์ IoT"}
          </div>
          {view === "active" && (
            <>
              <p className="mt-2 text-sm text-brand-900/60">
                {farms && farms.length === 0
                  ? "สร้างฟาร์มก่อน แล้วจึงเพิ่มอุปกรณ์"
                  : "เพิ่ม SMF IoT Node เพื่อเริ่มเชื่อมต่อฟาร์มของคุณ"}
              </p>
              <div className="mt-6 inline-flex">
                {farms && farms.length === 0 ? (
                  <Link
                    href="/dashboard/farms/new"
                    className="rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-3 text-sm transition"
                  >
                    + เพิ่มฟาร์มก่อน
                  </Link>
                ) : (
                  addBtn
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {list.map((d) => (
            <DeviceCard key={d.id} device={d} canRestore={check.ok} />
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
