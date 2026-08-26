"use client";

import { useState, useTransition } from "react";
import { createApiKey, revokeApiKey } from "../actions";

type Permission = "READ_DEVICES" | "READ_STATUS" | "READ_SENSORS" | "READ_READINGS" | "CONTROL_DEVICES" | "WEBHOOK_MANAGE";

const READ_PERMS: { key: Permission; label: string }[] = [
  { key: "READ_DEVICES", label: "อ่านรายชื่ออุปกรณ์" },
  { key: "READ_STATUS", label: "อ่านสถานะอุปกรณ์" },
  { key: "READ_SENSORS", label: "อ่านรายชื่อ Sensor" },
  { key: "READ_READINGS", label: "อ่านค่า Sensor" },
];
const CONTROL_PERMS: { key: Permission; label: string }[] = [
  { key: "CONTROL_DEVICES", label: "สั่งงานอุปกรณ์ (Control)" },
  { key: "WEBHOOK_MANAGE", label: "จัดการ Webhook" },
];

export type ApiKeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  permissions: string[];
  scope_device_ids: string[] | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export function ApiKeysSection({
  keys,
  devices,
  planAllowsControl,
  maxKeys,
}: {
  keys: ApiKeyRow[];
  devices: { id: string; device_name: string }[];
  planAllowsControl: boolean;
  maxKeys: number | null;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<{ plaintext: string; prefix: string } | null>(null);
  const [scopeAll, setScopeAll] = useState(true);

  const active = keys.filter((k) => !k.revoked_at);
  const atLimit = maxKeys !== null && active.length >= maxKeys;

  function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createApiKey(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setJustCreated({ plaintext: res.plaintext, prefix: res.prefix });
      setShowCreate(false);
    });
  }

  function handleRevoke(id: string, name: string) {
    if (!confirm(`Revoke API key "${name}"? ใช้งานต่อไม่ได้ทันที ย้อนกลับไม่ได้`)) return;
    startTransition(() => revokeApiKey(id));
  }

  return (
    <div className="card p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-brand-800">API Keys</h2>
          <p className="text-xs text-brand-900/50 mt-0.5">
            {active.length} / {maxKeys === null ? "ไม่จำกัด" : maxKeys} key ที่ใช้งานอยู่
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          disabled={atLimit}
          className="rounded-full bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 transition"
        >
          + Create API Key
        </button>
      </div>

      {justCreated && (
        <div className="rounded-xl border border-green-300 bg-green-50 p-4 space-y-2">
          <div className="font-bold text-green-900 text-sm">สร้าง key สำเร็จ — คัดลอกไว้ตอนนี้ จะไม่แสดงอีก</div>
          <code className="block break-all text-xs bg-white border border-green-200 rounded-lg px-3 py-2 font-mono text-brand-900">
            {justCreated.plaintext}
          </code>
          <button
            type="button"
            onClick={() => setJustCreated(null)}
            className="text-xs text-green-800 underline"
          >
            ปิด
          </button>
        </div>
      )}

      {showCreate && (
        <form action={handleCreate} className="rounded-xl border border-border p-4 space-y-4">
          <div>
            <label className="text-xs font-semibold text-brand-900/70">ชื่อ Key</label>
            <input
              name="name"
              required
              placeholder="เช่น My Integration"
              className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <div className="text-xs font-semibold text-brand-900/70 mb-1.5">Permission</div>
            <div className="grid sm:grid-cols-2 gap-1.5">
              {READ_PERMS.map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-xs text-brand-900/85">
                  <input type="checkbox" name="permissions" value={p.key} defaultChecked className="rounded border-border text-brand-600" />
                  {p.label}
                </label>
              ))}
              {planAllowsControl &&
                CONTROL_PERMS.map((p) => (
                  <label key={p.key} className="flex items-center gap-2 text-xs text-brand-900/85">
                    <input type="checkbox" name="permissions" value={p.key} className="rounded border-border text-brand-600" />
                    {p.label}
                  </label>
                ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-brand-900/70 mb-1.5">Scope</div>
            <label className="flex items-center gap-2 text-xs text-brand-900/85 mb-1.5">
              <input type="radio" checked={scopeAll} onChange={() => setScopeAll(true)} className="text-brand-600" />
              ทุกอุปกรณ์ในบัญชี
            </label>
            <label className="flex items-center gap-2 text-xs text-brand-900/85">
              <input type="radio" checked={!scopeAll} onChange={() => setScopeAll(false)} className="text-brand-600" />
              เฉพาะอุปกรณ์ที่เลือก
            </label>
            {!scopeAll && (
              <div className="mt-2 max-h-32 overflow-y-auto rounded-lg border border-border p-2 space-y-1">
                {devices.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-xs text-brand-900/80">
                    <input type="checkbox" name="scope_device_ids" value={d.id} className="rounded border-border text-brand-600" />
                    {d.device_name}
                  </label>
                ))}
              </div>
            )}
          </div>
          {error && <p className="text-xs text-red-700">{error}</p>}
          <div className="flex items-center gap-2">
            <button type="submit" disabled={pending} className="rounded-full bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-4 py-2 disabled:opacity-50">
              {pending ? "กำลังสร้าง..." : "สร้าง Key"}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="rounded-full border border-border text-xs font-medium px-4 py-2 text-brand-800">
              ยกเลิก
            </button>
          </div>
        </form>
      )}

      {keys.length === 0 ? (
        <p className="text-sm text-brand-900/50">ยังไม่มี API key</p>
      ) : (
        <div className="divide-y divide-border">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="font-semibold text-brand-800 flex items-center gap-2">
                  {k.name}
                  {k.revoked_at && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-100 text-red-700">Revoked</span>
                  )}
                </div>
                <div className="text-xs text-brand-900/50 font-mono">
                  {k.key_prefix}••••••••• · {k.permissions.join(", ")}
                  {k.scope_device_ids ? ` · ${k.scope_device_ids.length} device` : " · ทุกอุปกรณ์"}
                </div>
                <div className="text-[11px] text-brand-900/40 mt-0.5">
                  สร้าง {new Date(k.created_at).toLocaleDateString("th-TH")} · ใช้ล่าสุด{" "}
                  {k.last_used_at ? new Date(k.last_used_at).toLocaleString("th-TH") : "ยังไม่เคยใช้"}
                </div>
              </div>
              {!k.revoked_at && (
                <button
                  type="button"
                  onClick={() => handleRevoke(k.id, k.name)}
                  className="shrink-0 text-xs text-red-600 hover:text-red-800 font-medium"
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
