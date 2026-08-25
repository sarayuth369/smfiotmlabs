"use client";

import { useState, useTransition } from "react";
import { createMqttUser } from "../actions";

export function CreateUserForm() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ username: string; password: string; acl_rules: number } | null>(null);
  const [copied, setCopied] = useState(false);

  function submit(formData: FormData) {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const r = await createMqttUser(formData);
      if (r.ok) setResult(r);
      else setError(r.error);
    });
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function reset() {
    setOpen(false);
    setResult(null);
    setError(null);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 transition"
      >
        + สร้าง MQTT User
      </button>
    );
  }

  if (result) {
    return (
      <div className="card p-5 border-2 border-amber-300 bg-amber-50/70 space-y-3">
        <div className="text-sm font-bold text-amber-900">
          ⚠ Password นี้จะแสดงครั้งเดียวเท่านั้น — {result.acl_rules} ACL rules สร้างแล้ว
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <div className="text-xs font-semibold text-amber-900/70 mb-1">Username</div>
            <code className="block font-mono text-sm bg-white border border-amber-200 rounded-lg px-3 py-2 break-all">
              {result.username}
            </code>
          </div>
          <div>
            <div className="text-xs font-semibold text-amber-900/70 mb-1">Password</div>
            <div className="flex gap-2">
              <code className="flex-1 font-mono text-sm bg-white border border-amber-200 rounded-lg px-3 py-2 break-all">
                {result.password}
              </code>
              <button
                type="button"
                onClick={() => copy(result.password)}
                className="text-xs rounded-lg border border-amber-300 hover:bg-amber-100 px-3 py-2 font-medium text-amber-900"
              >
                {copied ? "✓" : "Copy"}
              </button>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={reset}
          className="text-xs rounded-full border border-amber-300 hover:bg-amber-100 px-4 py-1.5 font-semibold text-amber-900"
        >
          ปิด
        </button>
      </div>
    );
  }

  return (
    <form action={submit} className="card p-5 space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-brand-900/70 mb-1">Device UID</label>
          <input
            name="device_uid"
            required
            placeholder="SMF-A1B2C3"
            pattern="SMF-[A-Fa-f0-9]{6,20}"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm font-mono"
          />
          <p className="mt-1 text-[11px] text-brand-900/50">รูปแบบ SMF-XXXXXX (hex A-F 0-9)</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-brand-900/70 mb-1">Customer UUID</label>
          <input
            name="customer_uuid"
            required
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm font-mono"
          />
        </div>
      </div>
      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 transition disabled:opacity-50"
        >
          {pending ? "กำลังสร้าง..." : "สร้าง User"}
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-full border border-border text-sm font-medium px-4 py-2 text-brand-800"
        >
          ยกเลิก
        </button>
      </div>
    </form>
  );
}
