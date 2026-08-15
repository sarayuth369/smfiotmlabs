"use client";

import Link from "next/link";
import { useState } from "react";
import { PLAN_INFO, type PlanId } from "@/lib/plans";
import { formatThaiDate, daysUntil } from "@/lib/payment";
import { UpgradeModal } from "@/app/pricing/_components/UpgradeModal";

export function PlanCard({
  plan,
  expiresAt,
  planName,
  planLabel,
}: {
  plan: PlanId;
  expiresAt: string | null;
  /** DB-driven plan name (falls back to hard-coded PLAN_INFO) */
  planName?: string;
  /** DB-driven price label e.g. "฿499 / เดือน" */
  planLabel?: string;
}) {
  const [openPlan, setOpenPlan] = useState<"pro" | "business" | null>(null);

  const info = PLAN_INFO[plan];
  const displayName = planName ?? info.name;
  const displayLabel = planLabel ?? info.label;
  const canUpgrade = plan === "starter" || plan === "pro";
  const canRenew = plan === "pro" || plan === "business";
  const isEnterprise = plan === "enterprise";

  const daysLeft = expiresAt ? daysUntil(expiresAt) : null;
  const expired = daysLeft !== null && daysLeft <= 0;
  const nearExpiry = daysLeft !== null && daysLeft > 0 && daysLeft <= 7;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <div
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${info.badgeClass}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
        แพ็กเกจ: {displayName}
        <span className="opacity-70 font-normal normal-case tracking-normal">
          • {displayLabel}
        </span>
      </div>

      {expiresAt && canRenew && (
        <div
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
            expired
              ? "bg-red-500/20 text-red-100 border border-red-300/40"
              : nearExpiry
                ? "bg-amber-400/20 text-amber-100 border border-amber-300/40"
                : "bg-white/15 text-white/90 border border-white/20"
          }`}
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          หมดอายุ {formatThaiDate(expiresAt)}
          {daysLeft !== null && !expired && (
            <span className="opacity-70">• เหลือ {daysLeft} วัน</span>
          )}
        </div>
      )}

      {canRenew && (
        <button
          type="button"
          onClick={() => setOpenPlan(plan as "pro" | "business")}
          className="inline-flex items-center gap-1.5 rounded-full bg-white text-brand-700 hover:bg-brand-50 px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
          ต่ออายุแพ็กเกจ
        </button>
      )}

      {canUpgrade && (
        <Link
          href="/pricing"
          className="inline-flex items-center gap-1.5 rounded-full bg-white/15 border border-white/25 text-white hover:bg-white/25 px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
          Upgrade Plan
        </Link>
      )}

      {isEnterprise && (
        <Link
          href="/#contact"
          className="inline-flex items-center gap-1.5 rounded-full bg-white text-brand-700 hover:bg-brand-50 px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition"
        >
          ติดต่อฝ่ายขาย
        </Link>
      )}

      <Link
        href="/pricing"
        className="text-xs text-white/70 hover:text-white underline underline-offset-2"
      >
        ดูรายละเอียดแพ็กเกจทั้งหมด
      </Link>

      <UpgradeModal open={!!openPlan} plan={openPlan} onClose={() => setOpenPlan(null)} />
    </div>
  );
}
