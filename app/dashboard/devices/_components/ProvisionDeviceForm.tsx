"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { provisionDevice, type ProvisionResult } from "../actions";
import { ProvisionInstallFlasher } from "./ProvisionInstallFlasher";
import { PlanLimitNotice } from "../../farms/_components/PlanLimitNotice";

export type FarmOpt = { id: string; name: string };
export type ZoneOpt = { id: string; name: string; farm_id: string };
export type QuotaInfo = { ok: boolean; planName: string; current: number; limit: number };

const DEVICE_TYPES = ["ESP32 Node", "Gateway", "Sensor Hub", "Relay Module", "อื่น ๆ"];

export function ProvisionDeviceForm({
  initialFarmId,
  initialZoneId,
  farms,
  zones,
  quota,
}: {
  initialFarmId?: string;
  initialZoneId?: string | null;
  farms: FarmOpt[];
  zones: ZoneOpt[];
  quota: QuotaInfo;
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

        {emqxOk && (
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/70 p-5">
            <div className="text-sm font-bold text-amber-900">⚠ Password นี้จะแสดงครั้งเดียวเท่านั้น</div>
            <p className="mt-1 text-xs text-amber-800">
              บันทึกไว้ทันที — เก็บคู่กับ Device UID นี้. <strong>อย่ากด &quot;สร้าง Credential ใหม่&quot; ที่หน้า MQTT/Firmware ทีหลังโดยไม่จำเป็น</strong> —
              การ regenerate จะทำให้ password ที่เพิ่ง flash เข้าบอร์ดตอนนี้ใช้ต่อไม่ได้ทันที (ต้อง re-flash ใหม่อีกรอบ)
            </p>
            <div className="mt-4 space-y-3">
              <CredRow label="Username" value={result.mqtt_username} />
              <CredRow label="Password" value={result.mqtt_password} secret />
            </div>
          </div>
        )}

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
            <strong>⚠ เฟิร์มแวร์ยังไม่พร้อมใช้งานในขณะนี้</strong>
            <div className="mt-2 text-xs">อุปกรณ์ลงทะเบียนสำเร็จแล้ว กรุณาลองใหม่อีกครั้งในภายหลัง หรือติดต่อทีมงานหากยังพบปัญหา</div>
          </div>
        )}

        {!emqxOk && (
          <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
            <strong>⚠ การเชื่อมต่อ MQTT ยังไม่พร้อมใช้งาน</strong>
            <div className="mt-2 text-xs">กรุณาลองลงทะเบียนอุปกรณ์ใหม่อีกครั้ง หรือติดต่อทีมงานหากยังพบปัญหา</div>
          </div>
        )}

        <details className="rounded-xl border border-brand-200 bg-brand-50/40 p-4">
          <summary className="text-sm font-semibold text-brand-800 cursor-pointer">
            🔧 ขั้นสูง: ดาวน์โหลด secrets.h (สำหรับ flash ด้วยตัวเอง)
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

  // Checked AFTER the result?.ok branch above, on purpose: a Server
  // Action revalidates /dashboard/devices on success, which re-runs this
  // page's canCreateNode() check server-side with the device that was
  // JUST created now counted — quota.ok flips to false on the very
  // request that succeeded. If this check ran first, the success panel
  // (and the flasher) would get replaced by a plan-limit notice right
  // after a successful registration. Once `result` holds a real answer,
  // it wins regardless of what quota looks like on the next render.
  if (!quota.ok) {
    return (
      <div className="space-y-4">
        <PlanLimitNotice planName={quota.planName} current={quota.current} limit={quota.limit} entity="อุปกรณ์" />
        <div className="flex justify-end">
          <Link
            href="/dashboard/devices"
            className="rounded-full border border-border hover:bg-brand-50 text-brand-800 font-medium px-5 py-2.5 text-sm transition"
          >
            กลับไปรายการอุปกรณ์
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card p-6 sm:p-8 space-y-5">
      <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4 text-xs text-brand-900/80">
        <strong>ลงทะเบียนอุปกรณ์:</strong> Device UID + MQTT password จะสร้างอัตโนมัติ. ระบบจะแสดง credentials ครั้งเดียวหลัง register — ต้อง download <code>secrets.h</code> ทันที
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

function CredRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [reveal, setReveal] = useState(!secret);
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="text-xs font-semibold text-amber-900/70 mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 font-mono text-sm bg-white border border-amber-200 rounded-lg px-3 py-2 break-all">
          {reveal ? value : "•".repeat(value.length)}
        </code>
        {secret && (
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            className="text-xs rounded-lg border border-amber-300 hover:bg-amber-100 px-3 py-2 font-medium text-amber-900"
          >
            {reveal ? "🙈" : "👁"}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="text-xs rounded-lg border border-amber-300 hover:bg-amber-100 px-3 py-2 font-medium text-amber-900"
        >
          {copied ? "✓" : "Copy"}
        </button>
      </div>
    </div>
  );
}
