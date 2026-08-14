import { createAdminClient } from "@/lib/supabase/admin";

export type IncomeCategory = "upgrade" | "renew" | "hardware";

export type IncomeRow = {
  category: IncomeCategory;
  order_number: string;
  amount: number;
  date: string; // ISO — revenue date (verified_at / paid_at, fallback created_at)
  user_id: string;
  user_name: string | null;
  detail: string; // e.g. "Pro × 3 เดือน" or "Starter Node × 2"
};

export type IncomeRange = { start: Date; end: Date };

/** Inclusive start, exclusive end. If month === null → whole year. */
export function rangeFor(year: number, month: number | null): IncomeRange {
  if (month === null) {
    return {
      start: new Date(Date.UTC(year, 0, 1)),
      end: new Date(Date.UTC(year + 1, 0, 1)),
    };
  }
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

export async function fetchIncomeRows(range: IncomeRange): Promise<IncomeRow[]> {
  const admin = createAdminClient();
  const startIso = range.start.toISOString();
  const endIso = range.end.toISOString();

  // Plan upgrade / renew — verified within range
  const { data: plans } = await admin
    .from("payment_requests")
    .select("id, order_number, plan, months, amount, is_renew, user_id, user_name, verified_at, created_at")
    .eq("status", "verified")
    .gte("verified_at", startIso)
    .lt("verified_at", endIso);

  // Hardware — paid within range
  const { data: hardware } = await admin
    .from("hardware_orders")
    .select("id, order_number, product_name, quantity, amount, user_id, paid_at, created_at")
    .in("status", ["paid", "shipped", "delivered"])
    .gte("paid_at", startIso)
    .lt("paid_at", endIso);

  const rows: IncomeRow[] = [];

  for (const r of plans ?? []) {
    rows.push({
      category: r.is_renew ? "renew" : "upgrade",
      order_number: r.order_number ?? r.id.slice(0, 8),
      amount: Number(r.amount),
      date: r.verified_at ?? r.created_at,
      user_id: r.user_id,
      user_name: r.user_name,
      detail: `${(r.plan as string).toUpperCase()} × ${r.months ?? 1} เดือน`,
    });
  }

  for (const r of hardware ?? []) {
    rows.push({
      category: "hardware",
      order_number: r.order_number ?? r.id.slice(0, 8),
      amount: Number(r.amount),
      date: r.paid_at ?? r.created_at,
      user_id: r.user_id,
      user_name: null,
      detail: `${r.product_name} × ${r.quantity ?? 1}`,
    });
  }

  rows.sort((a, b) => b.date.localeCompare(a.date));
  return rows;
}

export type IncomeSummary = {
  total: number;
  upgrade: number;
  renew: number;
  hardware: number;
  counts: { upgrade: number; renew: number; hardware: number };
};

export function summarize(rows: IncomeRow[]): IncomeSummary {
  const s: IncomeSummary = {
    total: 0,
    upgrade: 0,
    renew: 0,
    hardware: 0,
    counts: { upgrade: 0, renew: 0, hardware: 0 },
  };
  for (const r of rows) {
    s.total += r.amount;
    s[r.category] += r.amount;
    s.counts[r.category] += 1;
  }
  return s;
}

export type DailyBucket = {
  day: string; // YYYY-MM-DD (local)
  upgrade: number;
  renew: number;
  hardware: number;
  total: number;
};

function dayKey(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function bucketDaily(rows: IncomeRow[]): DailyBucket[] {
  const map = new Map<string, DailyBucket>();
  for (const r of rows) {
    const k = dayKey(r.date);
    let b = map.get(k);
    if (!b) {
      b = { day: k, upgrade: 0, renew: 0, hardware: 0, total: 0 };
      map.set(k, b);
    }
    b[r.category] += r.amount;
    b.total += r.amount;
  }
  return [...map.values()].sort((a, b) => b.day.localeCompare(a.day));
}
