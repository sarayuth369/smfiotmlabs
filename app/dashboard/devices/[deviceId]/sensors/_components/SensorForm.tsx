"use client";

import Link from "next/link";
import { useState } from "react";
import { defaultUnitFrom, type SensorTypeInfo } from "@/lib/sensor-types";

export type SensorFormValues = {
  name?: string;
  sensor_type?: string;
  unit?: string | null;
  description?: string | null;
  channel?: string | null;
  status?: string;
};

export function SensorForm({
  action,
  initial,
  submitLabel,
  cancelHref,
  sensorTypes,
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: SensorFormValues;
  submitLabel: string;
  cancelHref: string;
  sensorTypes: SensorTypeInfo[];
}) {
  const v = initial ?? {};
  const firstType = sensorTypes[0]?.key ?? "";
  const [type, setType] = useState<string>(v.sensor_type || firstType);
  const [unit, setUnit] = useState<string>(v.unit ?? defaultUnitFrom(sensorTypes, type || firstType));

  const onTypeChange = (t: string) => {
    setType(t);
    // Overwrite unit only if user hasn't customized (unit still matches previous default)
    if (
      unit === defaultUnitFrom(sensorTypes, v.sensor_type ?? "") ||
      unit === "" ||
      unit === defaultUnitFrom(sensorTypes, type || "")
    ) {
      setUnit(defaultUnitFrom(sensorTypes, t));
    }
  };

  return (
    <form action={action} className="card p-6 sm:p-8 space-y-5">
      <div>
        <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">
          ชื่อ Sensor <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          name="name"
          defaultValue={v.name ?? ""}
          required
          maxLength={120}
          placeholder="เช่น อุณหภูมิโรงเรือน"
          className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">
            Sensor Type <span className="text-red-500">*</span>
          </label>
          <select
            name="sensor_type"
            required
            value={type}
            onChange={(e) => onTypeChange(e.target.value)}
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
          >
            {sensorTypes.map((t) => (
              <option key={t.key} value={t.key}>
                {t.icon} {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">
            หน่วยวัด (Unit)
          </label>
          <input
            type="text"
            name="unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder={defaultUnitFrom(sensorTypes, type || "")}
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
          />
          <p className="mt-1 text-xs text-brand-900/50">
            Default: {defaultUnitFrom(sensorTypes, type || "") || "-"} — แก้ได้ตามรุ่นเซนเซอร์
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">
            Channel / Address{" "}
            <span className="text-xs font-normal text-brand-900/50">(สำหรับ hardware หลายชุด)</span>
          </label>
          <input
            type="text"
            name="channel"
            defaultValue={v.channel ?? ""}
            maxLength={64}
            placeholder="เช่น A0, S1, 0x76"
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition font-mono"
          />
          <p className="mt-1 text-xs text-brand-900/50">
            ใช้แยก sensor ประเภทเดียวกันที่มีหลายตัวบนอุปกรณ์เดียว
          </p>
        </div>
        <div>
          <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">สถานะ</label>
          <select
            name="status"
            defaultValue={v.status ?? "active"}
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">รายละเอียด</label>
        <textarea
          name="description"
          defaultValue={v.description ?? ""}
          rows={3}
          className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition resize-y"
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
        <Link
          href={cancelHref}
          className="rounded-full border border-border hover:bg-brand-50 text-brand-800 font-medium px-5 py-2.5 text-sm transition"
        >
          ยกเลิก
        </Link>
        <button
          type="submit"
          className="rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2.5 text-sm transition"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
