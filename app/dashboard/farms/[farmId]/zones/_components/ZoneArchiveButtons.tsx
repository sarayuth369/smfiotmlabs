"use client";

import { archiveZone, restoreZone, deleteZone } from "../actions";

export function ArchiveZoneButton({
  farmId,
  zoneId,
  zoneName,
}: {
  farmId: string;
  zoneId: string;
  zoneName: string;
}) {
  return (
    <form
      action={archiveZone.bind(null, farmId, zoneId)}
      onSubmit={(e) => {
        if (!confirm(`เก็บถาวรแปลง "${zoneName}"?\n\nแปลงจะถูกซ่อนจากรายการหลัก กู้คืนได้ทีหลัง`)) {
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

export function RestoreZoneButton({
  farmId,
  zoneId,
  zoneName,
  canRestore,
}: {
  farmId: string;
  zoneId: string;
  zoneName: string;
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
      action={restoreZone.bind(null, farmId, zoneId)}
      onSubmit={(e) => {
        if (!confirm(`กู้คืนแปลง "${zoneName}"?`)) e.preventDefault();
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

export function DeleteZoneButton({
  farmId,
  zoneId,
  zoneName,
}: {
  farmId: string;
  zoneId: string;
  zoneName: string;
}) {
  return (
    <form
      action={deleteZone.bind(null, farmId, zoneId)}
      onSubmit={(e) => {
        if (
          !confirm(`ลบแปลง "${zoneName}" ถาวร?\n\nข้อมูลจะถูกลบไม่สามารถย้อนกลับได้\nแนะนำใช้ "เก็บถาวร" แทน`)
        ) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-700 font-medium px-4 py-2 text-sm transition"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        </svg>
        ลบแปลง
      </button>
    </form>
  );
}
