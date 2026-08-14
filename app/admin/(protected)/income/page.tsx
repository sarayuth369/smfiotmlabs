import Link from "next/link";
import { requireModule } from "@/lib/admin/current";
import { formatThaiDateTime } from "@/lib/payment";
import {
  fetchIncomeRows,
  summarize,
  bucketDaily,
  rangeFor,
  type IncomeCategory,
} from "@/lib/admin/income";

const CATEGORY_LABEL: Record<IncomeCategory, string> = {
  upgrade: "Upgrade Plan",
  renew: "Renew",
  hardware: "IoT Node",
};

const CATEGORY_COLOR: Record<IncomeCategory, string> = {
  upgrade: "bg-brand-600 text-white",
  renew: "bg-sky-500 text-white",
  hardware: "bg-brand-900 text-white",
};

function fmtDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(y, m - 1, d));
}

function baht(n: number): string {
  return `฿${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export default async function IncomePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  await requireModule("income");

  const now = new Date();
  const params = await searchParams;
  const year = parseInt(String(params.year ?? now.getFullYear()), 10) || now.getFullYear();
  const monthRaw = String(params.month ?? String(now.getMonth() + 1));
  const month = monthRaw === "all" ? null : Math.max(1, Math.min(12, parseInt(monthRaw, 10) || now.getMonth() + 1));

  const range = rangeFor(year, month);
  const rows = await fetchIncomeRows(range);
  const summary = summarize(rows);
  const daily = bucketDaily(rows);

  const yearsBack = 3;
  const yearOptions = Array.from({ length: yearsBack + 1 }, (_, i) => now.getFullYear() - i);
  const monthOptions = [
    { v: "1", l: "มกราคม" }, { v: "2", l: "กุมภาพันธ์" }, { v: "3", l: "มีนาคม" },
    { v: "4", l: "เมษายน" }, { v: "5", l: "พฤษภาคม" }, { v: "6", l: "มิถุนายน" },
    { v: "7", l: "กรกฎาคม" }, { v: "8", l: "สิงหาคม" }, { v: "9", l: "กันยายน" },
    { v: "10", l: "ตุลาคม" }, { v: "11", l: "พฤศจิกายน" }, { v: "12", l: "ธันวาคม" },
  ];

  const periodLabel = month === null
    ? `ทั้งปี ${year}`
    : `${monthOptions[month - 1].l} ${year}`;

  const exportHref = `/admin/income/export?year=${year}&month=${month === null ? "all" : month}`;

  return (
    <div>
      <div className="mb-6">
        <div className="text-xs text-brand-700/70 font-medium">รายงาน</div>
        <h1 className="text-2xl font-bold text-brand-800">Income Report</h1>
        <p className="text-sm text-brand-900/60 mt-1">
          สรุปรายได้ในแต่ละวัน แยกตามประเภท (Upgrade / Renew / IoT Node)
        </p>
      </div>

      {/* Filters */}
      <form action="/admin/income" method="get" className="mb-5 flex flex-wrap items-center gap-3">
        <label className="text-sm text-brand-900/70">ปี</label>
        <select
          name="year"
          defaultValue={year}
          className="rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <label className="text-sm text-brand-900/70">เดือน</label>
        <select
          name="month"
          defaultValue={month === null ? "all" : String(month)}
          className="rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        >
          <option value="all">ทั้งปี</option>
          {monthOptions.map((m) => (
            <option key={m.v} value={m.v}>{m.l}</option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 text-sm transition"
        >
          แสดงผล
        </button>
        <div className="ml-auto text-sm text-brand-900/60">
          ช่วงเวลา: <span className="font-semibold text-brand-800">{periodLabel}</span>
        </div>
        <a
          href={exportHref}
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 hover:border-brand-400 text-brand-800 font-medium px-3 py-2 text-sm transition"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          Export CSV
        </a>
      </form>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="card p-4">
          <div className="text-xs text-brand-900/55">รายได้รวม</div>
          <div className="text-2xl font-bold text-brand-800">{baht(summary.total)}</div>
          <div className="text-xs text-brand-900/50 mt-0.5">
            {(summary.counts.upgrade + summary.counts.renew + summary.counts.hardware).toLocaleString()} รายการ
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-brand-900/55">Upgrade Plan</div>
          <div className="text-2xl font-bold text-brand-700">{baht(summary.upgrade)}</div>
          <div className="text-xs text-brand-900/50 mt-0.5">{summary.counts.upgrade} รายการ</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-brand-900/55">Renew</div>
          <div className="text-2xl font-bold text-sky-700">{baht(summary.renew)}</div>
          <div className="text-xs text-brand-900/50 mt-0.5">{summary.counts.renew} รายการ</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-brand-900/55">IoT Node</div>
          <div className="text-2xl font-bold text-brand-900">{baht(summary.hardware)}</div>
          <div className="text-xs text-brand-900/50 mt-0.5">{summary.counts.hardware} รายการ</div>
        </div>
      </div>

      {/* Daily table */}
      <div className="card p-5 sm:p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-brand-800">ยอดรวมรายวัน</h2>
          <div className="text-xs text-brand-900/55">{daily.length} วัน</div>
        </div>
        {daily.length === 0 ? (
          <div className="py-8 text-center text-sm text-brand-900/50">ไม่มีรายการในช่วงนี้</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-brand-900/60 uppercase">
                  <th className="py-2 px-3">วันที่</th>
                  <th className="py-2 px-3 text-right">Upgrade</th>
                  <th className="py-2 px-3 text-right">Renew</th>
                  <th className="py-2 px-3 text-right">IoT Node</th>
                  <th className="py-2 px-3 text-right font-bold">รวม</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((d) => (
                  <tr key={d.day} className="border-b border-border/60 hover:bg-brand-50/30">
                    <td className="py-2.5 px-3 text-brand-800 font-medium">{fmtDay(d.day)}</td>
                    <td className="py-2.5 px-3 text-right text-brand-700">{d.upgrade ? baht(d.upgrade) : "-"}</td>
                    <td className="py-2.5 px-3 text-right text-sky-700">{d.renew ? baht(d.renew) : "-"}</td>
                    <td className="py-2.5 px-3 text-right text-brand-900">{d.hardware ? baht(d.hardware) : "-"}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-brand-800">{baht(d.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-brand-200 bg-brand-50/40">
                  <td className="py-3 px-3 font-bold text-brand-800">รวมทั้งหมด</td>
                  <td className="py-3 px-3 text-right font-bold text-brand-700">{baht(summary.upgrade)}</td>
                  <td className="py-3 px-3 text-right font-bold text-sky-700">{baht(summary.renew)}</td>
                  <td className="py-3 px-3 text-right font-bold text-brand-900">{baht(summary.hardware)}</td>
                  <td className="py-3 px-3 text-right font-extrabold text-brand-800">{baht(summary.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Detail list */}
      <div className="card p-5 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-brand-800">รายการทั้งหมด</h2>
          <div className="text-xs text-brand-900/55">{rows.length} รายการ</div>
        </div>
        {rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-brand-900/50">ไม่มีรายการในช่วงนี้</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-brand-900/60 uppercase">
                  <th className="py-2 px-3">วันเวลา</th>
                  <th className="py-2 px-3">ประเภท</th>
                  <th className="py-2 px-3">หมายเลข</th>
                  <th className="py-2 px-3">รายละเอียด</th>
                  <th className="py-2 px-3">ลูกค้า</th>
                  <th className="py-2 px-3 text-right">จำนวน</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.order_number}-${i}`} className="border-b border-border/60 hover:bg-brand-50/30">
                    <td className="py-2.5 px-3 text-brand-900/85 whitespace-nowrap">{formatThaiDateTime(r.date)}</td>
                    <td className="py-2.5 px-3">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${CATEGORY_COLOR[r.category]}`}>
                        {CATEGORY_LABEL[r.category]}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-xs text-brand-800">{r.order_number}</td>
                    <td className="py-2.5 px-3 text-brand-900/80">{r.detail}</td>
                    <td className="py-2.5 px-3 text-brand-900/70">{r.user_name || <Link href={`/admin/members?q=${r.user_id.slice(0, 8)}`} className="text-brand-600 hover:underline">{r.user_id.slice(0, 8)}</Link>}</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-brand-800 whitespace-nowrap">{baht(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
