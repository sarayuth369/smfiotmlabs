import Link from "next/link";
import { FarmForm } from "../_components/FarmForm";
import { createFarm } from "../actions";

export default function NewFarmPage() {
  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 text-sm text-brand-700/70 mb-2">
        <Link href="/dashboard/farms" className="hover:text-brand-900">← ฟาร์มของฉัน</Link>
      </div>
      <h1 className="text-2xl font-bold text-brand-800">เพิ่มฟาร์ม</h1>
      <p className="text-sm text-brand-900/60 mt-1">กรอกข้อมูลฟาร์มของคุณ</p>

      <div className="mt-6">
        <FarmForm action={createFarm} submitLabel="บันทึกฟาร์ม" cancelHref="/dashboard/farms" />
      </div>
    </div>
  );
}
