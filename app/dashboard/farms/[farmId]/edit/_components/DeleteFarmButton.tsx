"use client";

export function DeleteFarmButton({
  action,
  farmName,
}: {
  action: () => Promise<void>;
  farmName: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`ลบฟาร์ม "${farmName}" ถาวร?\n\nข้อมูลที่ผูกกับฟาร์มนี้จะถูกลบทั้งหมด\nการลบไม่สามารถย้อนกลับได้`)) {
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
        ลบฟาร์ม
      </button>
    </form>
  );
}
