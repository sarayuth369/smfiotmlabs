"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { provisionDevice, type ProvisionResult } from "../actions";
import { ProvisionInstallFlasher } from "./ProvisionInstallFlasher";

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

  if (result?.ok) {
    const emqxOk = result.emqx_activation.ok;
    const firmwareReady = result.firmware.available;
    return (
      <div className="card p-6 sm:p-8 space-y-5">
        <div className="rounded-xl border-2 border-green-300 bg-green-50 p-5">
          <div className="text-lg font-bold text-green-800">✅ ลงทะเบียนอุปกรณ์สำเร็จ</div>
          <div className="mt-2 text-sm text-green-900 space-y-1">
            <div>Device UID: <code className="font-mono font-bold">{result.device_uid}</code></div>
            <div>
              EMQX activation: {emqxOk
                ? <span className="text-green-700 font-semibold">✓ พร้อมใช้ ({result.emqx_activation.user}, {result.emqx_activation.acl_rules} ACL rules)</span>
                : <span className="text-red-700 font-semibold">✗ ล้มเหลว: {(result.emqx_activation as {error:string}).error}</span>}
            </div>
            <div>
              Firmware: {firmwareReady
                ? <span className="text-green-700 font-semibold">✓ v{result.firmware.release_version} ({result.firmware.artifacts.length} artifacts พร้อม flash)</span>
                : <span className="text-red-700 font-semibold">✗ ไม่พร้อม: {(result.firmware as {reason:string}).reason}</span>}
            </div>
          </div>
        </div>

        {firmwareReady && emqxOk && (
          <ProvisionInstallFlasher
            deviceId={result.device_id}
            deviceUid={result.device_uid}
            releaseVersion={result.firmware.release_version}
            artifacts={result.firmware.artifacts}
          />
        )}

        {!firmwareReady && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <strong>⚠ Base firmware ไม่พร้อม.</strong> Admin ต้อง upload firmware.bin ที่ <Link href="/admin/firmware" className="underline">/admin/firmware</Link> ก่อน (SMF-MAIN-V1 v2.0.0, channel stable/test, approve + set latest).
            <div className="mt-2 text-xs">Device UID ถูกลงทะเบียนแล้ว — หลัง upload firmware, กลับมาที่หน้านี้ + provision device ใหม่ (device_uid นี้ใช้แล้ว, ต้อง generate ใหม่)</div>
          </div>
        )}

        {!emqxOk && (
          <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
            <strong>⚠ EMQX activation ล้มเหลว.</strong> Device MQTT credential ยังไม่ active. ตรวจ webhook + ลอง provision ใหม่ (device_uid ถูกใช้แล้ว)
          </div>
        )}

        <details className="rounded-xl border border-brand-200 bg-brand-50/40 p-4">
          <summary className="text-sm font-semibold text-brand-800 cursor-pointer">
            🔧 Advanced: manual secrets.h download + SSH activation (legacy fallback)
          </summary>
          <div className="mt-3 space-y-3 text-xs text-brand-900/80">
            <div>
              <strong>Manual flash</strong> — ใช้เฉพาะเมื่อ Web USB flash ไม่ทำงาน. Download secrets.h + compile firmware ด้วย PlatformIO เอง.
            </div>
            <button
              onClick={downloadSecretsH}
              className="rounded-full border border-brand-300 hover:border-brand-500 text-brand-800 font-semibold px-4 py-1.5 text-xs"
            >
              ⬇ Download secrets-{result.device_uid}.h
            </button>
            {!emqxOk && (
              <>
                <div>
                  <strong>Manual EMQX activation</strong> — copy command แล้ว SSH ไปที่ VPS:
                </div>
                <div className="font-mono text-[11px] bg-brand-900/95 text-white/90 rounded-lg p-3 break-all">
                  {result.emqx_activation_command}
                </div>
              </>
            )}
          </div>
        </details>

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
