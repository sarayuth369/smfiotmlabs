"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { provisionDevice, type ProvisionResult } from "../actions";

export type FarmOpt = { id: string; name: string };
export type ZoneOpt = { id: string; name: string; farm_id: string };

const DEVICE_TYPES = ["ESP32 Node", "Gateway", "Sensor Hub", "Relay Module", "อื่น ๆ"];

export function ProvisionDeviceForm({
  initialFarmId,
  initialZoneId,
  farms,
  zones,
}: {
  initialFarmId?: string;
  initialZoneId?: string | null;
  farms: FarmOpt[];
  zones: ZoneOpt[];
}) {
  const [selectedFarm, setSelectedFarm] = useState<string>(initialFarmId ?? farms[0]?.id ?? "");
  const filteredZones = useMemo(
    () => zones.filter((z) => z.farm_id === selectedFarm),
    [zones, selectedFarm]
  );
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    setResult(null);
    startTransition(async () => {
      const r = await provisionDevice(fd);
      if (!r.ok) setError(r.error);
      setResult(r);
    });
  };

  const downloadSecretsH = () => {
    if (!result?.ok) return;
    const blob = new Blob([result.secrets_h_content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `secrets-${result.device_uid}.h`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyActivationCmd = async () => {
    if (!result?.ok) return;
    try {
      await navigator.clipboard.writeText(result.emqx_activation_command);
    } catch {
      /* clipboard blocked */
    }
  };

  if (result?.ok) {
    return (
      <div className="card p-6 sm:p-8 space-y-5">
        <div className="rounded-xl border-2 border-green-300 bg-green-50 p-5">
          <div className="text-lg font-bold text-green-800">✅ ลงทะเบียนอุปกรณ์สำเร็จ</div>
          <div className="mt-2 text-sm text-green-900">
            Device UID: <code className="font-mono font-bold">{result.device_uid}</code>
          </div>
        </div>

        <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-5">
          <div className="text-base font-bold text-amber-900 mb-2">⚠ MQTT Password (แสดงครั้งเดียว)</div>
          <p className="text-sm text-amber-900 mb-3">
            รหัสผ่านนี้จะไม่แสดงอีก. Download <code>secrets.h</code> เดี๋ยวนี้เพื่อใช้ compile firmware.
          </p>
          <div className="font-mono text-xs bg-white/70 rounded-lg p-3 break-all border border-amber-300">
            {result.mqtt_password}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold text-brand-800">1) ดาวน์โหลด secrets.h</div>
          <button
            onClick={downloadSecretsH}
            className="rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2.5 text-sm"
          >
            ⬇ Download secrets-{result.device_uid}.h
          </button>
          <p className="text-xs text-brand-900/60">
            วางไฟล์ที่ <code>D:\ArduinoProjects\ESP32 S3 N16R8\firmware\main_board\include\secrets.h</code> → build + flash ESP32
          </p>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold text-brand-800">2) เปิดใช้ MQTT user บน VPS</div>
          <p className="text-xs text-brand-900/60">
            Copy คำสั่งนี้แล้ว SSH ไปที่ VPS รัน (สร้าง MQTT user + ACL):
          </p>
          <div className="font-mono text-[11px] bg-brand-900/95 text-white/90 rounded-lg p-3 break-all">
            {result.emqx_activation_command}
          </div>
          <button
            onClick={copyActivationCmd}
            className="text-xs rounded-full border border-brand-300 hover:border-brand-500 text-brand-800 font-semibold px-4 py-1.5"
          >
            📋 Copy command
          </button>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold text-brand-800">3) Flash ESP32</div>
          <ol className="text-xs text-brand-900/70 list-decimal ml-5 space-y-1">
            <li>ต่อ USB-C กับ ESP32-S3 (COM port)</li>
            <li>
              <code className="text-[11px]">cd &quot;D:\ArduinoProjects\ESP32 S3 N16R8\firmware\main_board&quot;</code>
            </li>
            <li>
              <code className="text-[11px]">pio run -t upload</code>
            </li>
            <li>
              <code className="text-[11px]">pio device monitor</code>
            </li>
            <li>รอเห็น <code>[MQTT] connecting to mqtt.bkknex.com:8883 ... connected</code></li>
          </ol>
        </div>

        <div className="pt-3 border-t border-border flex flex-wrap gap-3">
          <Link
            href={`/dashboard/devices/${result.device_id}`}
            className="rounded-full bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2 text-sm"
          >
            เปิดหน้า Device
          </Link>
          <Link
            href="/dashboard/devices"
            className="rounded-full border border-border hover:bg-brand-50 text-brand-800 font-medium px-5 py-2 text-sm"
          >
            รายการอุปกรณ์
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card p-6 sm:p-8 space-y-5">
      <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4 text-xs text-brand-900/80">
        <strong>Phase 6 Multi-Tenant Provisioning:</strong> Device UID + MQTT password จะสร้างอัตโนมัติ. ระบบจะแสดง credentials ครั้งเดียวหลัง register — ต้อง download <code>secrets.h</code> ทันที
      </div>

      <div>
        <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">ชื่ออุปกรณ์ *</label>
        <input
          name="device_name"
          required
          placeholder="เช่น NODE-แปลง-มะเขือเทศ"
          className="w-full rounded-xl border border-border px-4 py-2.5 text-sm"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">ฟาร์ม *</label>
          <select
            name="farm_id"
            required
            value={selectedFarm}
            onChange={(e) => setSelectedFarm(e.target.value)}
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm"
          >
            {farms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">แปลง (Zone)</label>
          <select
            name="zone_id"
            defaultValue={initialZoneId ?? ""}
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm"
          >
            <option value="">— ยังไม่เลือก —</option>
            {filteredZones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">ประเภท</label>
          <select
            name="device_type"
            defaultValue="ESP32 Node"
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm"
          >
            {DEVICE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-brand-900/85 mb-1.5">Model</label>
          <input
            name="model"
            placeholder="ESP32-S3 N16R8"
            defaultValue="ESP32-S3 N16R8"
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm"
          />
        </div>
      </div>

      <input type="hidden" name="firmware_version" value="2.0.0" />

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white font-semibold px-6 py-2.5 text-sm"
        >
          {pending ? "กำลังลงทะเบียน..." : "ลงทะเบียน + สร้าง Credentials"}
        </button>
        <Link
          href="/dashboard/devices"
          className="rounded-full border border-border hover:bg-brand-50 text-brand-800 font-medium px-6 py-2.5 text-sm"
        >
          ยกเลิก
        </Link>
      </div>
    </form>
  );
}
