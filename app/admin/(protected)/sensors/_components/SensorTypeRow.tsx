"use client";

import { useState } from "react";
import { IconPicker } from "./IconPicker";
import { updateSensorType, deleteSensorType } from "../actions";

type Row = { id: string; key: string; label: string; icon: string; unit: string; inUseCount: number };

export function SensorTypeRow({ row }: { row: Row }) {
  const [editing, setEditing] = useState(false);
  const boundUpdate = updateSensorType.bind(null, row.id);
  const boundDelete = deleteSensorType.bind(null, row.id, row.key);

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3 py-3 border-b border-border last:border-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl w-9 text-center shrink-0">{row.icon}</span>
          <div className="min-w-0">
            <div className="font-semibold text-brand-800">{row.label}</div>
            <div className="text-xs text-brand-900/50 font-mono">
              {row.key} · หน่วย: {row.unit || "-"}
              {row.inUseCount > 0 && ` · ใช้อยู่ ${row.inUseCount} sensor`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs rounded-full border border-border hover:border-brand-400 text-brand-800 px-3 py-1.5 font-medium transition"
          >
            แก้ไข
          </button>
          <form
            action={boundDelete}
            onSubmit={(e) => {
              if (!confirm(`ลบประเภท "${row.label}"?`)) e.preventDefault();
            }}
          >
            <button type="submit" className="text-xs text-red-600 hover:text-red-800 font-medium px-2">
              ลบ
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <form action={boundUpdate} onSubmit={() => setEditing(false)} className="py-3 border-b border-border last:border-0 space-y-3">
      <div className="text-xs font-mono text-brand-900/45">key: {row.key} (แก้ไม่ได้)</div>
      <div className="grid sm:grid-cols-[auto_1fr_120px] gap-3 items-start">
        <IconPicker name="icon" defaultValue={row.icon} />
        <div>
          <label className="text-xs font-semibold text-brand-900/70">ชื่อ</label>
          <input
            name="label"
            defaultValue={row.label}
            required
            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-brand-900/70">หน่วยวัด</label>
          <input
            name="unit"
            defaultValue={row.unit}
            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" className="text-xs rounded-full bg-brand-600 hover:bg-brand-700 text-white px-4 py-1.5 font-semibold transition">
          บันทึก
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-xs rounded-full border border-border px-4 py-1.5 font-medium text-brand-800 transition"
        >
          ยกเลิก
        </button>
      </div>
    </form>
  );
}
