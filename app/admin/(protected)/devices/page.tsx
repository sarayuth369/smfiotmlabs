import Link from "next/link";
import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatThaiDate } from "@/lib/payment";

type DeviceRow = {
  id: string;
  device_uid: string;
  device_name: string;
  farm_id: string;
  status: "online" | "offline" | "warning";
  firmware_version: string | null;
  hardware_version: string | null;
  is_disabled: boolean;
  archived_at: string | null;
  last_seen: string | null;
  created_at: string;
  farms: { name: string; user_id: string } | { name: string; user_id: string }[] | null;
};

const STATUS_CLS: Record<DeviceRow["status"], string> = {
  online: "bg-green-100 text-green-800",
  offline: "bg-brand-100 text-brand-700/70",
  warning: "bg-amber-100 text-amber-800",
};

const PAGE_SIZE = 25;

export default async function AdminDevicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  await requireModule("devices");
  const params = await searchParams;
  const q = String(params.q ?? "").trim();
  const statusFilter = params.status;
  const page = Math.max(1, parseInt(String(params.page ?? "1"), 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const admin = createAdminClient();

  let query = admin
    .from("iot_nodes")
    .select(
      "id, device_uid, device_name, farm_id, status, firmware_version, hardware_version, is_disabled, archived_at, last_seen, created_at, farms(name, user_id)",
      { count: "exact" }
    );

  if (q) {
    const safe = q.replace(/[,%]/g, " ").trim();
    if (safe) query = query.or(`device_name.ilike.%${safe}%,device_uid.ilike.%${safe}%`);
  }
  if (statusFilter && ["online", "offline", "warning"].includes(statusFilter)) {
    query = query.eq("status", statusFilter);
  }

  query = query.order("created_at", { ascending: false }).range(offset, offset + PAGE_SIZE - 1);

  const { data, count } = await query;
  const devices = (data ?? []) as DeviceRow[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Health stats
  const [{ count: onlineCount }, { count: offlineCount }, { count: disabledCount }] = await Promise.all([
    admin.from("iot_nodes").select("id", { count: "exact", head: true }).eq("status", "online").is("archived_at", null),
    admin.from("iot_nodes").select("id", { count: "exact", head: true }).eq("status", "offline").is("archived_at", null),
    admin.from("iot_nodes").select("id", { count: "exact", head: true }).eq("is_disabled", true).is("archived_at", null),
  ]);

  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (statusFilter) qs.set("status", statusFilter);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return `/admin/devices${s ? "?" + s : ""}`;
  };

  return (
    <div>
      <div className="mb-6">
        <div className="text-xs text-brand-700/70 font-medium">รายการ</div>
        <h1 className="text-2xl font-bold text-brand-800">IoT Devices</h1>
        <p className="text-sm text-brand-900/60 mt-1">
          จัดการอุปกรณ์ IoT ทั้งหมดในระบบ — สถานะออนไลน์, firmware, credentials
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        <div className="card p-4">
          <div className="text-xs text-brand-900/55">Online</div>
          <div className="text-2xl font-bold text-green-700">{(onlineCount ?? 0).toLocaleString()}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-brand-900/55">Offline</div>
          <div className="text-2xl font-bold text-brand-700/70">{(offlineCount ?? 0).toLocaleString()}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-brand-900/55">Disabled</div>
          <div className="text-2xl font-bold text-red-700">{(disabledCount ?? 0).toLocaleString()}</div>
        </div>
      </div>

      <form action="/admin/devices" method="get" className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="ค้นหาจากชื่อ หรือ device_uid..."
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
          />
        </div>
        <select
          name="status"
          defaultValue={statusFilter ?? ""}
          className="rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500"
        >
          <option value="">ทุกสถานะ</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="warning">Warning</option>
        </select>
        <button
          type="submit"
          className="rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2.5 text-sm transition"
        >
          ค้นหา
        </button>
        {(q || statusFilter) && (
          <Link href="/admin/devices" className="text-sm text-brand-700 hover:text-brand-900 underline">
            ล้าง
          </Link>
        )}
        <div className="ml-auto text-sm text-brand-900/60">
          พบ <span className="font-semibold text-brand-800">{total.toLocaleString()}</span> อุปกรณ์
        </div>
      </form>

      {devices.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-5xl">📡</div>
          <div className="mt-3 font-semibold text-brand-800">
            {q || statusFilter ? "ไม่พบอุปกรณ์ที่ตรงกับเงื่อนไข" : "ยังไม่มีอุปกรณ์ในระบบ"}
          </div>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-50/70 border-b border-brand-100">
              <tr className="text-left text-xs font-bold uppercase tracking-wider text-brand-800/70">
                <th className="px-4 py-3">Device</th>
                <th className="px-4 py-3">Farm</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Firmware</th>
                <th className="px-4 py-3">Last Seen</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-100">
              {devices.map((d) => {
                const farm = Array.isArray(d.farms) ? d.farms[0] : d.farms;
                return (
                  <tr key={d.id} className="hover:bg-brand-50/50">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-brand-800">{d.device_name}</div>
                      <div className="font-mono text-xs text-brand-900/55">{d.device_uid}</div>
                    </td>
                    <td className="px-4 py-3 text-brand-900/80">{farm?.name ?? "-"}</td>
                    <td className="px-4 py-3">
                      {d.is_disabled ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-red-100 text-red-800">
                          Disabled
                        </span>
                      ) : d.archived_at ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                          Archived
                        </span>
                      ) : (
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${STATUS_CLS[d.status]}`}>
                          {d.status}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-brand-900/70">
                      {d.firmware_version ?? "-"}
                      {d.hardware_version && <div className="text-[10px] text-brand-900/50">HW: {d.hardware_version}</div>}
                    </td>
                    <td className="px-4 py-3 text-brand-900/70 text-xs">
                      {d.last_seen ? formatThaiDate(d.last_seen) : "ยังไม่เคยเชื่อมต่อ"}
                    </td>
                    <td className="px-4 py-3 text-brand-900/70 text-xs">
                      {formatThaiDate(d.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2 text-sm">
          <Link
            href={pageHref(Math.max(1, page - 1))}
            aria-disabled={page <= 1}
            className={`px-3 py-1.5 rounded-lg border transition ${
              page <= 1
                ? "border-border text-brand-900/30 pointer-events-none"
                : "border-brand-200 text-brand-800 hover:border-brand-400"
            }`}
          >
            ← ก่อนหน้า
          </Link>
          <div className="text-brand-900/70">
            หน้า <span className="font-semibold text-brand-800">{page}</span> / {totalPages}
          </div>
          <Link
            href={pageHref(Math.min(totalPages, page + 1))}
            aria-disabled={page >= totalPages}
            className={`px-3 py-1.5 rounded-lg border transition ${
              page >= totalPages
                ? "border-border text-brand-900/30 pointer-events-none"
                : "border-brand-200 text-brand-800 hover:border-brand-400"
            }`}
          >
            ถัดไป →
          </Link>
        </div>
      )}
    </div>
  );
}
