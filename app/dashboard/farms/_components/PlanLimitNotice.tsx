import Link from "next/link";

export function PlanLimitNotice({
  planName,
  current,
  limit,
  entity = "ฟาร์ม",
}: {
  planName: string;
  current: number;
  limit: number;
  entity?: string;
}) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 flex flex-wrap items-start gap-4">
      <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 9v4M12 17h.01" />
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        </svg>
      </div>
      <div className="flex-1 min-w-[240px]">
        <div className="font-bold text-amber-900">
          คุณใช้จำนวน{entity}ครบตามแพ็กเกจ {planName} แล้ว
        </div>
        <div className="text-sm text-amber-900/80 mt-1">
          ใช้ไป {current} / {limit} — อัปเกรดแพ็กเกจเพื่อเพิ่มจำนวน{entity}
        </div>
      </div>
      <Link
        href="/pricing"
        className="shrink-0 rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2.5 text-sm transition"
      >
        ดูแพ็กเกจ
      </Link>
    </div>
  );
}
