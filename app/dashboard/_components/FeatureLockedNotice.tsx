import Link from "next/link";

export function FeatureLockedNotice({
  planName,
  featureLabel,
  compact = false,
}: {
  planName: string;
  featureLabel: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-amber-200 bg-amber-50 flex flex-wrap items-start gap-4 ${
        compact ? "p-4" : "p-5"
      }`}
    >
      <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="10" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <div className="flex-1 min-w-[200px]">
        <div className="font-bold text-amber-900">คุณไม่สามารถใช้งานฟีเจอร์นี้ได้</div>
        <div className="text-sm text-amber-900/80 mt-1">
          &quot;{featureLabel}&quot; ไม่รวมอยู่ในแพ็กเกจ {planName} ของคุณ — อัปเกรดแพ็กเกจเพื่อเปิดใช้งาน
        </div>
      </div>
      <Link
        href="/pricing"
        className="shrink-0 rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2.5 text-sm transition"
      >
        อัปเกรดแพ็กเกจ
      </Link>
    </div>
  );
}
