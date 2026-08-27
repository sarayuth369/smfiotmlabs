"use client";

import { useState, useTransition } from "react";
import { createWebhook, toggleWebhook, deleteWebhook, testWebhookAction } from "../actions";

const EVENTS = [
  { key: "device_online", label: "อุปกรณ์กลับมาออนไลน์" },
  { key: "sensor_threshold", label: "Sensor ถึงเกณฑ์ที่ตั้งไว้ (Rules)" },
  { key: "automation_triggered", label: "Automation ทำงาน (แจ้งเตือน)" },
  { key: "device_event", label: "เหตุการณ์อื่นจากอุปกรณ์ (boot, ota, error)" },
];

export type WebhookRow = { id: string; url: string; events: string[]; enabled: boolean; created_at: string };

export function WebhooksSection({ webhooks }: { webhooks: WebhookRow[] }) {
  const [showCreate, setShowCreate] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createWebhook(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setShowCreate(false);
    });
  }

  function handleTest(id: string) {
    startTransition(async () => {
      const res = await testWebhookAction(id);
      setTestResult((s) => ({ ...s, [id]: res.ok ? `✓ ส่งสำเร็จ (HTTP ${res.status})` : `✗ ส่งไม่สำเร็จ${res.status ? ` (HTTP ${res.status})` : ""}` }));
    });
  }

  return (
    <div className="card p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-brand-800">Webhooks</h2>
          <p className="text-xs text-brand-900/50 mt-0.5">ส่ง event สำคัญไปยัง URL ของคุณแบบ real-time</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="rounded-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 transition"
        >
          + Add Webhook
        </button>
      </div>

      {showCreate && (
        <form action={handleCreate} className="rounded-xl border border-border p-4 space-y-4">
          <div>
            <label className="text-xs font-semibold text-brand-900/70">URL</label>
            <input
              name="url"
              required
              placeholder="https://your-server.com/webhook"
              className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <div className="text-xs font-semibold text-brand-900/70 mb-1.5">Event</div>
            <div className="space-y-1.5">
              {EVENTS.map((e) => (
                <label key={e.key} className="flex items-center gap-2 text-xs text-brand-900/85">
                  <input type="checkbox" name="events" value={e.key} defaultChecked className="rounded border-border text-brand-600" />
                  {e.label}
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-red-700">{error}</p>}
          <div className="flex items-center gap-2">
            <button type="submit" disabled={pending} className="rounded-full bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-4 py-2 disabled:opacity-50">
              {pending ? "กำลังบันทึก..." : "บันทึก"}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="rounded-full border border-border text-xs font-medium px-4 py-2 text-brand-800">
              ยกเลิก
            </button>
          </div>
        </form>
      )}

      {webhooks.length === 0 ? (
        <p className="text-sm text-brand-900/50">ยังไม่มี Webhook</p>
      ) : (
        <div className="divide-y divide-border">
          {webhooks.map((w) => (
            <div key={w.id} className="py-3 space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-sm text-brand-800 truncate">{w.url}</div>
                  <div className="text-xs text-brand-900/50">{w.events.join(", ")}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => handleTest(w.id)} className="text-xs rounded-full border border-border hover:border-brand-400 text-brand-800 px-3 py-1.5 font-medium">
                    Test
                  </button>
                  <button
                    type="button"
                    onClick={() => startTransition(() => toggleWebhook(w.id, !w.enabled))}
                    className="text-xs rounded-full border border-border hover:border-brand-400 text-brand-800 px-3 py-1.5 font-medium"
                  >
                    {w.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("ลบ Webhook นี้?")) startTransition(() => deleteWebhook(w.id));
                    }}
                    className="text-xs text-red-600 hover:text-red-800 font-medium"
                  >
                    ลบ
                  </button>
                </div>
              </div>
              {testResult[w.id] && <div className="text-xs text-brand-900/60">{testResult[w.id]}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
