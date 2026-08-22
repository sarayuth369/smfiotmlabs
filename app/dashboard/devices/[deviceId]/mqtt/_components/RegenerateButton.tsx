"use client";

import { useState } from "react";
import { regenerateDeviceCredential } from "../actions";

export function RegenerateButton({ deviceId }: { deviceId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ username: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function onClick() {
    if (
      !confirm(
        "สร้าง MQTT credential ใหม่?\n\n⚠ ESP32 ที่ใช้ password เดิมจะถูก EMQX ปฏิเสธทันที (auth fail)\nต้อง Web USB re-flash firmware ด้วย credential ใหม่\n\nFlutter app: อัพเดต Broker settings ด้วย password ใหม่ก็พอ"
      )
    )
      return;

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await regenerateDeviceCredential(deviceId);
      if (r.ok) {
        setResult({ username: r.mqtt_username, password: r.mqtt_password });
      } else {
        setError(r.error);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function copy(label: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-700 font-semibold px-4 py-2 text-sm transition disabled:opacity-50"
      >
        {loading ? "กำลังสร้าง..." : "🔄 สร้าง Credential ใหม่"}
      </button>

      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-2xl border-2 border-amber-300 bg-amber-50/70 p-5">
          <div className="text-sm font-bold text-amber-900">
            ⚠ Password นี้จะแสดงครั้งเดียวเท่านั้น
          </div>
          <p className="mt-1 text-xs text-amber-800">
            บันทึกไว้ทันที — ไม่มีทางดูอีกหลังปิดหน้านี้ ต้อง Regenerate ใหม่เท่านั้น
          </p>

          <div className="mt-4 space-y-3">
            <CredRow label="Username" value={result.username} onCopy={copy} copied={copied} />
            <CredRow label="Password" value={result.password} onCopy={copy} copied={copied} secret />
          </div>

          <div className="mt-4 rounded-lg bg-white/70 border border-amber-200 p-3 text-xs text-amber-900 space-y-2">
            <div>
              <strong>Flutter app</strong>: MQTT Broker → Host <code className="font-mono">mqtt.bkknex.com</code> Port <code>8883</code> TLS ON, Username + Password ข้างบน → Save → เชื่อมต่อใหม่
            </div>
            <div>
              <strong>ESP32</strong>: ต้อง Web USB re-flash firmware — เพราะ password ใหม่ถูก patch เข้า ProvisioningSlot ตอน flash. ไปที่หน้า &quot;เพิ่มอุปกรณ์&quot; → เลือก device เดิม (หรือ provision ใหม่) → กด &quot;🔌 ติดตั้ง Firmware&quot;.
            </div>
            <div className="text-amber-900/70">
              EMQX broker activation = อัตโนมัติผ่าน webhook (mqtt.bkknex.com:8443). ไม่ต้อง SSH หรือ manual config.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CredRow({
  label,
  value,
  secret,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  secret?: boolean;
  onCopy: (l: string, v: string) => void;
  copied: string | null;
}) {
  const [reveal, setReveal] = useState(!secret);
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
          onClick={() => onCopy(label, value)}
          className="text-xs rounded-lg border border-amber-300 hover:bg-amber-100 px-3 py-2 font-medium text-amber-900"
        >
          {copied === label ? "✓" : "Copy"}
        </button>
      </div>
    </div>
  );
}
