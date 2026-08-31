import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { HealthDeviceCard, type HealthDeviceRow } from "./_components/HealthDeviceCard";

type Row = {
  id: string;
  device_uid: string;
  device_name: string;
  farm_id: string;
  hardware_model: string | null;
  firmware_version: string | null;
  device_health:
    | { status: string; health_score: number; last_seen_at: string | null; issues: unknown[] }
    | { status: string; health_score: number; last_seen_at: string | null; issues: unknown[] }[]
    | null;
};

const STATUS_ORDER: Record<string, number> = { offline: 0, critical: 1, warning: 2, healthy: 3 };

export default async function MyDeviceHealthPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; farm?: string }>;
}) {
  const sp = await searchParams;
  const q = String(sp.q ?? "").trim().toLowerCase();
  const statusFilter = sp.status ?? "";
  const farmFilter = sp.farm ?? "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Same ownership pattern as /dashboard/devices — devices scoped to the
  // user's own farms, RLS on iot_nodes/device_health enforces it again
  // server-side regardless (see device_health_select_owner policy).
  const { data: farms } = await supabase.from("farms").select("id, name").eq("user_id", user!.id);
  const farmIds = (farms ?? []).map((f) => f.id as string);
  const farmMap = new Map((farms ?? []).map((f) => [f.id as string, f.name as string]));

  let rows: Row[] = [];
  if (farmIds.length > 0) {
    const { data } = await supabase
      .from("iot_nodes")
      .select(
        "id, device_uid, device_name, farm_id, hardware_model, firmware_version, device_health(status, health_score, last_seen_at, issues)"
      )
      .in("farm_id", farmIds)
      .is("archived_at", null);
    rows = (data ?? []) as Row[];
  }

  const oneRow = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
  const devices: HealthDeviceRow[] = rows.map((r) => {
    const health = oneRow(r.device_health);
    return {
      id: r.id,
      device_uid: r.device_uid,
      device_name: r.device_name,
      farm_id: r.farm_id,
      farm_name: farmMap.get(r.farm_id) ?? null,
      hardware_model: r.hardware_model,
      firmware_version: r.firmware_version,
      status: (health?.status as HealthDeviceRow["status"]) ?? "offline",
      score: health?.health_score ?? 0,
      lastSeen: health?.last_seen_at ?? null,
      issueCount: Array.isArray(health?.issues) ? health.issues.length : 0,
    };
  });

  const summary = {
    total: devices.length,
    healthy: devices.filter((d) => d.status === "healthy").length,
    warning: devices.filter((d) => d.status === "warning").length,
    critical: devices.filter((d) => d.status === "critical").length,
    offline: devices.filter((d) => d.status === "offline").length,
  };

  let filtered = devices;
  if (q) filtered = filtered.filter((d) => d.device_name.toLowerCase().includes(q) || d.device_uid.toLowerCase().includes(q));
  if (statusFilter) filtered = filtered.filter((d) => d.status === statusFilter);
  if (farmFilter) filtered = filtered.filter((d) => d.farm_id === farmFilter);
  filtered = [...filtered].sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href="/dashboard" className="hover:text-brand-900">← Dashboard</Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-800">สุขภาพอุปกรณ์ของฉัน</h1>
        <p className="text-sm text-brand-900/60 mt-1">ติดตามสถานะและสุขภาพของอุปกรณ์ในฟาร์มของคุณแบบอัตโนมัติ</p>
      </div>

      {devices.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-5xl">📡</div>
          <div className="mt-3 font-semibold text-brand-800">ยังไม่มีอุปกรณ์ในบัญชีของคุณ</div>
          <Link
            href="/dashboard/devices/new"
            className="mt-5 inline-flex rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2.5 text-sm transition"
          >
            + เพิ่มอุปกรณ์
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            <div className="card p-4">
              <div className="text-xs text-brand-900/55">Total</div>
              <div className="text-2xl font-bold text-brand-800">{summary.total}</div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-brand-900/55">Healthy</div>
              <div className="text-2xl font-bold text-green-700">{summary.healthy}</div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-brand-900/55">Warning</div>
              <div className="text-2xl font-bold text-amber-700">{summary.warning}</div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-brand-900/55">Critical</div>
              <div className="text-2xl font-bold text-red-700">{summary.critical}</div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-brand-900/55">Offline</div>
              <div className="text-2xl font-bold text-brand-700/70">{summary.offline}</div>
            </div>
          </div>

          <form action="/dashboard/device-health" method="get" className="mb-6 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="ค้นหาจากชื่อ หรือ device_uid..."
                className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
              />
            </div>
            <select name="status" defaultValue={statusFilter} className="rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500">
              <option value="">ทุกสถานะ</option>
              <option value="healthy">Healthy</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
              <option value="offline">Offline</option>
            </select>
            {farms && farms.length > 1 && (
              <select name="farm" defaultValue={farmFilter} className="rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500">
                <option value="">ทุกฟาร์ม</option>
                {farms.map((f) => (
                  <option key={f.id as string} value={f.id as string}>{f.name as string}</option>
                ))}
              </select>
            )}
            <button type="submit" className="rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2.5 text-sm transition">
              ค้นหา
            </button>
            {(q || statusFilter || farmFilter) && (
              <Link href="/dashboard/device-health" className="text-sm text-brand-700 hover:text-brand-900 underline">ล้าง</Link>
            )}
          </form>

          {filtered.length === 0 ? (
            <div className="card p-10 text-center text-brand-900/60">ไม่พบอุปกรณ์ที่ตรงกับเงื่อนไข</div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((d) => (
                <HealthDeviceCard key={d.id} device={d} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
