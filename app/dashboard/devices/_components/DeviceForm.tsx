"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type FarmOpt = { id: string; name: string };
export type ZoneOpt = { id: string; name: string; farm_id: string };

export type DeviceFormValues = {
  device_uid?: string;
  device_name?: string;
  farm_id?: string;
  zone_id?: string | null;
  device_type?: string | null;
  model?: string | null;
  firmware_version?: string | null;
};

const DEVICE_TYPES = ["ESP32 Node", "Gateway", "Sensor Hub", "Relay Module", "อื่น ๆ"];

export function DeviceForm({
  action,
  initial,
  farms,
  zones,
  submitLabel,
  cancelHref,
  lockUid = false,
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: DeviceFormValues;
  farms: FarmOpt[];
  zones: ZoneOpt[];
  submitLabel: string;
  cancelHref: string;
  /** true = show UID readonly (edit page) */
  lockUid?: boolean;
}) {
  const v = initial ?? {};
  const [selectedFarm, setSelectedFarm] = useState<string>(v.farm_id ?? farms[0]?.id ?? "");
  const filteredZones = useMemo(
    () => zones.filter((z) => z.farm_id === selectedFarm),
    [zones, selectedFarm]
  );

  return (
    <form action={action} className="card p-6 sm:p-8 space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">
            Device UID <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="device_uid"
            defaultValue={v.device_uid ?? ""}
            required
            readOnly={lockUid}
            maxLength={64}
            placeholder="เช่น SMF-000001"
            className={`w-full rounded-xl border border-border px-4 py-2.5 outline-none transition font-mono ${
              lockUid
                ? "bg-brand-50/60 text-brand-900/70 cursor-not-allowed"
                : "bg-white focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
            }`}
          />
          <p className="mt-1 text-xs text-brand-900/50">
            ตัวอักษร/ตัวเลข/ขีดกลาง 3–64 ตัว — ห้ามซ้ำในระบบ
          </p>
        </div>
        <div>
          <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">
            ชื่ออุปกรณ์ <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="device_name"
            defaultValue={v.device_name ?? ""}
            required
            maxLength={120}
            placeholder="เช่น โหนด A แปลงมะเขือเทศ"
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">
            ฟาร์ม <span className="text-red-500">*</span>
          </label>
          <select
            name="farm_id"
            required
            value={selectedFarm}
            onChange={(e) => setSelectedFarm(e.target.value)}
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
          >
            {farms.length === 0 && <option value="">— ยังไม่มีฟาร์ม —</option>}
            {farms.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">
            แปลง / Zone
          </label>
          <select
            name="zone_id"
            defaultValue={v.zone_id ?? ""}
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
          >
            <option value="">— ยังไม่ระบุแปลง —</option>
            {filteredZones.map((z) => (
              <option key={z.id} value={z.id}>{z.name}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-brand-900/50">
            {filteredZones.length === 0
              ? "ฟาร์มนี้ยังไม่มีแปลง — ปล่อยว่างได้"
              : `เลือกได้ ${filteredZones.length} แปลง`}
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">ประเภท</label>
          <select
            name="device_type"
            defaultValue={v.device_type ?? ""}
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
          >
            <option value="">— ไม่ระบุ —</option>
            {DEVICE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">Model</label>
          <input
            type="text"
            name="model"
            defaultValue={v.model ?? ""}
            placeholder="เช่น SMF-Pro-2024"
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">
            Firmware Version
          </label>
          <input
            type="text"
            name="firmware_version"
            defaultValue={v.firmware_version ?? ""}
            placeholder="เช่น v1.0.0"
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 transition"
          />
        </div>
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
          disabled={farms.length === 0}
          className="rounded-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-2.5 text-sm transition"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
