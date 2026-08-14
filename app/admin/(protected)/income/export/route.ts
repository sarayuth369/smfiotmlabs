import { NextResponse, type NextRequest } from "next/server";
import { requireModule } from "@/lib/admin/current";
import { fetchIncomeRows, rangeFor } from "@/lib/admin/income";

export const dynamic = "force-dynamic";

/** Escape a CSV field: wrap in quotes + double any embedded quotes. */
function csv(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: NextRequest) {
  await requireModule("income");

  const url = new URL(req.url);
  const now = new Date();
  const year = parseInt(url.searchParams.get("year") ?? String(now.getFullYear()), 10) || now.getFullYear();
  const monthRaw = url.searchParams.get("month") ?? String(now.getMonth() + 1);
  const month = monthRaw === "all" ? null : Math.max(1, Math.min(12, parseInt(monthRaw, 10) || now.getMonth() + 1));

  const rows = await fetchIncomeRows(rangeFor(year, month));

  const header = ["Date", "Category", "OrderNumber", "Detail", "UserId", "UserName", "Amount"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.date,
        r.category,
        r.order_number,
        r.detail,
        r.user_id,
        r.user_name ?? "",
        r.amount,
      ].map(csv).join(",")
    );
  }

  // UTF-8 BOM so Excel opens Thai correctly
  const body = "﻿" + lines.join("\r\n") + "\r\n";
  const monthPart = month === null ? "all" : String(month).padStart(2, "0");
  const filename = `income-${year}-${monthPart}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
