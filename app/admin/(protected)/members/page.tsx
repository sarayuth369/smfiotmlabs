import Link from "next/link";
import { requireModule } from "@/lib/admin/current";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatThaiDate, formatThaiDateTime } from "@/lib/payment";
import { updateMember } from "./actions";
import { DeleteMemberButton } from "./_components/DeleteMemberButton";

type Member = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  plan: "starter" | "pro" | "business" | "enterprise" | null;
  plan_expires_at: string | null;
  provider: string | null;
  created_at: string;
};

const PAGE_SIZE = 15;

const PLAN_COLOR: Record<NonNullable<Member["plan"]>, string> = {
  starter: "bg-brand-100 text-brand-800",
  pro: "bg-brand-600 text-white",
  business: "bg-brand-800 text-white",
  enterprise: "bg-brand-900 text-white",
};

/** datetime-local requires "YYYY-MM-DDTHH:MM" in *local* time */
function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireModule("members");
  const params = await searchParams;
  const q = String(params.q ?? "").trim();
  const page = Math.max(1, parseInt(String(params.page ?? "1"), 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const admin = createAdminClient();

  let query = admin
    .from("profiles")
    .select(
      "id, email, full_name, phone, plan, plan_expires_at, provider, created_at",
      { count: "exact" }
    );

  if (q) {
    const safe = q.replace(/[,%]/g, " ").trim();
    if (safe) query = query.or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%`);
  }

  query = query.order("created_at", { ascending: false }).range(offset, offset + PAGE_SIZE - 1);

  const { data, count } = await query;
  const members = (data ?? []) as Member[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return `/admin/members${s ? "?" + s : ""}`;
  };

  return (
    <div>
      <div className="mb-6">
        <div className="text-xs text-brand-700/70 font-medium">รายการ</div>
        <h1 className="text-2xl font-bold text-brand-800">Users Management</h1>
        <p className="text-sm text-brand-900/60 mt-1">
          จัดการสมาชิก — แก้ไขข้อมูล, เปลี่ยนแพ็กเกจ, ตั้งวันหมดอายุ, ลบบัญชี
        </p>
      </div>

      {/* Search + summary */}
      <form action="/admin/members" method="get" className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="ค้นหาจากชื่อ หรืออีเมล..."
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
          />
        </div>
        <button
          type="submit"
          className="rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2.5 text-sm transition"
        >
          ค้นหา
        </button>
        {q && (
          <Link
            href="/admin/members"
            className="text-sm text-brand-700 hover:text-brand-900 underline"
          >
            ล้าง
          </Link>
        )}
        <div className="ml-auto text-sm text-brand-900/60">
          พบ <span className="font-semibold text-brand-800">{total.toLocaleString()}</span> สมาชิก
        </div>
      </form>

      {members.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-5xl">👥</div>
          <div className="mt-3 font-semibold text-brand-800">
            {q ? "ไม่พบสมาชิกที่ตรงกับคำค้น" : "ยังไม่มีสมาชิก"}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {members.map((m) => {
            const plan = (m.plan ?? "starter") as NonNullable<Member["plan"]>;
            return (
              <div key={m.id} className="card p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-brand-800">
                      {m.full_name || <span className="text-brand-900/50 italic">ไม่ระบุชื่อ</span>}
                    </div>
                    <div className="text-sm text-brand-900/70 break-all">{m.email ?? "-"}</div>
                    <div className="text-xs text-brand-900/55 mt-0.5">
                      โทร: {m.phone || "-"} • {m.provider ? `via ${m.provider}` : ""} • สมัคร {formatThaiDate(m.created_at)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className={`text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full ${PLAN_COLOR[plan]}`}>
                      {plan}
                    </div>
                    {m.plan_expires_at && (
                      <div className="text-[11px] text-brand-900/70 px-3 py-1 rounded-full border border-border">
                        หมดอายุ {formatThaiDateTime(m.plan_expires_at)}
                      </div>
                    )}
                  </div>
                </div>

                <form
                  action={updateMember.bind(null, m.id)}
                  className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end"
                >
                  <div>
                    <label className="block text-xs font-semibold text-brand-900/70 mb-1">ชื่อ - นามสกุล</label>
                    <input
                      name="full_name"
                      defaultValue={m.full_name ?? ""}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-brand-900/70 mb-1">เบอร์โทร</label>
                    <input
                      name="phone"
                      defaultValue={m.phone ?? ""}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-brand-900/70 mb-1">แพ็กเกจ</label>
                    <select
                      name="plan"
                      defaultValue={plan}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    >
                      <option value="starter">Starter</option>
                      <option value="pro">Pro</option>
                      <option value="business">Business</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-brand-900/70 mb-1">วันหมดอายุ</label>
                    <input
                      type="datetime-local"
                      name="plan_expires_at"
                      defaultValue={toDatetimeLocal(m.plan_expires_at)}
                      className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap items-center gap-2 justify-end">
                    <DeleteMemberButton userId={m.id} email={m.email ?? m.id.slice(0, 8)} />
                    <button
                      type="submit"
                      className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold px-4 py-2 text-sm transition"
                    >
                      บันทึกการเปลี่ยนแปลง
                    </button>
                  </div>
                </form>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
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
