import Link from "next/link";
import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatThaiDate } from "@/lib/payment";

type Row = {
  id: string;
  device_uid: string;
  device_name: string;
  farm_id: string;
  hardware_model: string | null;
  firmware_version: string | null;
  archived_at: string | null;
  farms: { name: string; user_id: string } | { name: string; user_id: string }[] | null;
  device_health:
    | { status: string; health_score: number; last_seen_at: string | null; issues: unknown[] }
    | { status: string; health_score: number; last_seen_at: string | null; issues: unknown[] }[]
    | null;
};

const STATUS_ORDER: Record<string, number> = { offline: 0, critical: 1, warning: 2, healthy: 3 };
const STATUS_CLS: Record<string, string> = {
  healthy: "bg-green-100 text-green-800",
  warning: "bg-amber-100 text-amber-800",
  critical: "bg-red-100 text-red-800",
  offline: "bg-brand-100 text-brand-700/70",
};
const PAGE_SIZE = 25;

export default async function DeviceHealthPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; hw?: string; fw?: string; page?: string }>;
}) {
  await requireModule("devices");
  const params = await searchParams;
  const q = String(params.q ?? "").trim();
  const statusFilter = params.status ?? "";
  const hwFilter = params.hw ?? "";
  const fwFilter = params.fw ?? "";
  const page = Math.max(1, parseInt(String(params.page ?? "1"), 10) || 1);

  const admin = createAdminClient();

  // Summary — cheap aggregate counts, no telemetry history involved.
  const [{ count: healthyCount }, { count: warningCount }, { count: criticalCount }, { count: offlineCount }, { count: total }] =
    await Promise.all([
      admin.from("device_health").select("device_id", { count: "exact", head: true }).eq("status", "healthy"),
      admin.from("device_health").select("device_id", { count: "exact", head: true }).eq("status", "warning"),
      admin.from("device_health").select("device_id", { count: "exact", head: true }).eq("status", "critical"),
      admin.from("device_health").select("device_id", { count: "exact", head: true }).eq("status", "offline"),
      admin.from("iot_nodes").select("id", { count: "exact", head: true }).is("archived_at", null),
    ]);

  let query = admin
    .from("iot_nodes")
    .select(
      "id, device_uid, device_name, farm_id, hardware_model, firmware_version, archived_at, farms(name, user_id), device_health(status, health_score, last_seen_at, issues)"
    )
    .is("archived_at", null);

  if (q) {
    const safe = q.replace(/[,%]/g, " ").trim();
    if (safe) query = query.or(`device_name.ilike.%${safe}%,device_uid.ilike.%${safe}%`);
  }
  if (hwFilter) query = query.eq("hardware_model", hwFilter);
  if (fwFilter) query = query.eq("firmware_version", fwFilter);

  const { data } = await query.limit(500); // filtered/sorted in-memory below — fleet is small, this is a monitoring page, not a hot path
  let rows = (data ?? []) as Row[];

  const oneRow = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

  const withHealth = rows.map((r) => {
    const health = oneRow(r.device_health);
    return {
      ...r,
      farm: oneRow(r.farms),
      status: health?.status ?? "offline",
      score: health?.health_score ?? 0,
      lastSeen: health?.last_seen_at ?? null,
      issueCount: Array.isArray(health?.issues) ? health.issues.length : 0,
    };
  });

  const filtered = statusFilter ? withHealth.filter((r) => r.status === statusFilter) : withHealth;
  filtered.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Owner emails — batch lookup, not per-row.
  const userIds = [...new Set(pageRows.map((r) => r.farm?.user_id).filter(Boolean))] as string[];
  const { data: profiles } = userIds.length
    ? await admin.from("profiles").select("id, email").in("id", userIds)
    : { data: [] };
  const emailByUser = new Map((profiles ?? []).map((p) => [p.id as string, p.email as string]));

  // Distinct hardware/firmware for filter dropdowns — cheap, small cardinality.
  const hwOptions = [...new Set(rows.map((r) => r.hardware_model).filter(Boolean))] as string[];
  const fwOptions = [...new Set(rows.map((r) => r.firmware_version).filter(Boolean))] as string[];

  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (statusFilter) qs.set("status", statusFilter);
    if (hwFilter) qs.set("hw", hwFilter);
    if (fwFilter) qs.set("fw", fwFilter);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return `/admin/device-health${s ? "?" + s : ""}`;
  };

  return (
    <div>
      <div className="mb-6">
        <div className="text-xs text-brand-700/70 font-medium">มอนิเตอร์</div>
        <h1 className="text-2xl font-bold text-brand-800">Device Health</h1>
        <p className="text-sm text-brand-900/60 mt-1">สถานะสุขภาพอุปกรณ์ทั้งหมด — evaluate อัตโนมัติจาก telemetry + sweep ทุก 5 นาที</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <div className="card p-4">
          <div className="text-xs text-brand-900/55">Total</div>
          <div className="text-2xl font-bold text-brand-800">{(total ?? 0).toLocaleString()}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-brand-900/55">Healthy</div>
          <div className="text-2xl font-bold text-green-700">{(healthyCount ?? 0).toLocaleString()}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-brand-900/55">Warning</div>
          <div className="text-2xl font-bold text-amber-700">{(warningCount ?? 0).toLocaleString()}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-brand-900/55">Critical</div>
          <div className="text-2xl font-bold text-red-700">{(criticalCount ?? 0).toLocaleString()}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-brand-900/55">Offline</div>
          <div className="text-2xl font-bold text-brand-700/70">{(offlineCount ?? 0).toLocaleString()}</div>
        </div>
      </div>

      <form action="/admin/device-health" method="get" className="mb-4 flex flex-wrap items-center gap-3">
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
        {hwOptions.length > 0 && (
          <select name="hw" defaultValue={hwFilter} className="rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500">
            <option value="">ทุก Hardware</option>
            {hwOptions.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
        )}
        {fwOptions.length > 0 && (
          <select name="fw" defaultValue={fwFilter} className="rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500">
            <option value="">ทุก Firmware</option>
            {fwOptions.map((f) => (
              <option key={f} value={f}>V{f}</option>
            ))}
          </select>
        )}
        <button type="submit" className="rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2.5 text-sm transition">
          ค้นหา
        </button>
        {(q || statusFilter || hwFilter || fwFilter) && (
          <Link href="/admin/device-health" className="text-sm text-brand-700 hover:text-brand-900 underline">ล้าง</Link>
        )}
        <div className="ml-auto text-sm text-brand-900/60">
          พบ <span className="font-semibold text-brand-800">{totalFiltered.toLocaleString()}</span> อุปกรณ์
        </div>
      </form>

      {pageRows.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-5xl">💚</div>
          <div className="mt-3 font-semibold text-brand-800">ไม่พบอุปกรณ์ที่ตรงกับเงื่อนไข</div>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-50/70 border-b border-brand-100">
              <tr className="text-left text-xs font-bold uppercase tracking-wider text-brand-800/70">
                <th className="px-4 py-3">Device</th>
                <th className="px-4 py-3">Farm / Owner</th>
                <th className="px-4 py-3">Hardware</th>
                <th className="px-4 py-3">Firmware</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Last Seen</th>
                <th className="px-4 py-3">Issues</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-100">
              {pageRows.map((d) => (
                <tr key={d.id} className="hover:bg-brand-50/50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/device-health/${d.id}`} className="font-semibold text-brand-800 hover:text-brand-600">
                      {d.device_name}
                    </Link>
                    <div className="font-mono text-xs text-brand-900/55">{d.device_uid}</div>
                  </td>
                  <td className="px-4 py-3 text-brand-900/80">
                    <div>{d.farm?.name ?? "-"}</div>
                    <div className="text-xs text-brand-900/50">{d.farm?.user_id ? emailByUser.get(d.farm.user_id) ?? "-" : "-"}</div>
                  </td>
                  <td className="px-4 py-3 text-brand-900/70 text-xs font-mono">{d.hardware_model ?? "-"}</td>
                  <td className="px-4 py-3 text-brand-900/70 text-xs font-mono">{d.firmware_version ? `V${d.firmware_version}` : "-"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${STATUS_CLS[d.status] ?? STATUS_CLS.offline}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-brand-900/80 font-semibold">{d.score}</td>
                  <td className="px-4 py-3 text-brand-900/70 text-xs">{d.lastSeen ? formatThaiDate(d.lastSeen) : "ยังไม่เคยเชื่อมต่อ"}</td>
                  <td className="px-4 py-3">
                    {d.issueCount > 0 ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700">{d.issueCount}</span>
                    ) : (
                      <span className="text-brand-900/40 text-xs">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2 text-sm">
          <Link href={pageHref(Math.max(1, page - 1))} className={`px-3 py-1.5 rounded-lg border transition ${page <= 1 ? "border-border text-brand-900/30 pointer-events-none" : "border-brand-200 text-brand-800 hover:border-brand-400"}`}>
            ← ก่อนหน้า
          </Link>
          <div className="text-brand-900/70">หน้า <span className="font-semibold text-brand-800">{page}</span> / {totalPages}</div>
          <Link href={pageHref(Math.min(totalPages, page + 1))} className={`px-3 py-1.5 rounded-lg border transition ${page >= totalPages ? "border-border text-brand-900/30 pointer-events-none" : "border-brand-200 text-brand-800 hover:border-brand-400"}`}>
            ถัดไป →
          </Link>
        </div>
      )}
    </div>
  );
}
