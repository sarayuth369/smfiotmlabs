"use client";

import { archiveFarm, restoreFarm } from "../actions";

export function ArchiveFarmButton({
  farmId,
  farmName,
}: {
  farmId: string;
  farmName: string;
}) {
  return (
    <form
      action={archiveFarm.bind(null, farmId)}
      onSubmit={(e) => {
        if (!confirm(`เก็บถาวรฟาร์ม "${farmName}"?\n\nฟาร์มจะถูกซ่อนจากรายการหลัก แต่ข้อมูลยังอยู่ กู้คืนได้ทีหลัง`)) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="inline-flex items-center gap-1 rounded-full border border-amber-200 hover:bg-amber-50 text-amber-800 text-xs font-semibold px-3 py-2 transition"
      >
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="4" rx="1" />
          <path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4" />
        </svg>
        เก็บถาวร
      </button>
    </form>
  );
}

export function RestoreFarmButton({
  farmId,
  farmName,
  canRestore,
}: {
  farmId: string;
  farmName: string;
  canRestore: boolean;
}) {
  if (!canRestore) {
    return (
      <div
        className="inline-flex items-center gap-1 rounded-full bg-brand-100 text-brand-700/60 text-xs font-semibold px-3 py-2 cursor-not-allowed"
        title="เต็มโควตาแล้ว อัปเกรดแพ็กเกจก่อนกู้คืน"
      >
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" />
        </svg>
        กู้คืน (เต็มโควตา)
      </div>
    );
  }
  return (
    <form
      action={restoreFarm.bind(null, farmId)}
      onSubmit={(e) => {
        if (!confirm(`กู้คืนฟาร์ม "${farmName}" กลับมาใช้งาน?`)) e.preventDefault();
      }}
    >
      <button
        type="submit"
        className="inline-flex items-center gap-1 rounded-full bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-3 py-2 transition"
      >
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" />
        </svg>
        กู้คืน
      </button>
    </form>
  );
}
