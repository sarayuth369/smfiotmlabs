"use client";

import { useMemo, useState, useTransition } from "react";
import { createAutomation, deleteAutomation, toggleAutomation } from "../automation-actions";
import type { AutomationRow, ActivityRow, AutomationInput } from "../automation-actions";

type Device = { id: string; device_uid: string; device_name: string };
type Relay = { channel: number; name: string; device_id: string };
type Sensor = { id: string; name: string; sensor_type: string; unit: string | null; device_id: string };

const DAY_LABELS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"]; // index = JS/cfg day-of-week, 0=Sun
const OPERATORS: { value: string; label: string }[] = [
  { value: "<", label: "น้อยกว่า (<)" },
  { value: "<=", label: "น้อยกว่าหรือเท่ากับ (≤)" },
  { value: ">", label: "มากกว่า (>)" },
  { value: ">=", label: "มากกว่าหรือเท่ากับ (≥)" },
  { value: "==", label: "เท่ากับ (=)" },
  { value: "!=", label: "ไม่เท่ากับ (≠)" },
];

function blankInput(deviceId: string): AutomationInput {
  return {
    name: "",
    device_id: deviceId,
    trigger_type: "sensor_value",
    operator: "<",
    value: 0,
    hour: 6,
    minute: 0,
    days: [0, 1, 2, 3, 4, 5, 6],
    channel: 1,
    state: true,
    notify: false,
    cooldown_seconds: 60,
  };
}

function triggerSummary(row: AutomationRow): string {
  const cfg = row.trigger_config;
  if (row.trigger_type === "schedule") {
    const days = (cfg.days as number[] | undefined) ?? [];
    const dayStr = days.length === 7 ? "ทุกวัน" : days.map((d) => DAY_LABELS[d]).join(" ");
    const h = String(cfg.hour ?? 0).padStart(2, "0");
    const m = String(cfg.minute ?? 0).padStart(2, "0");
    return `${dayStr} เวลา ${h}:${m}`;
  }
  const parts = [`${cfg.sensor_type ?? "sensor"} ${cfg.operator ?? ""} ${cfg.value ?? ""}`];
  const extra = cfg.extra as { operator: string; value: number }[] | undefined;
  if (extra && extra.length > 0) {
    const logic = (cfg.logic as string) === "OR" ? "หรือ" : "และ";
    parts.push(`${logic} เงื่อนไข 2: ${extra[0].operator} ${extra[0].value}`);
  }
  return parts.join(" ");
}

function actionSummary(row: AutomationRow): string {
  const a = row.action_config as { channel?: number; state?: boolean };
  const relayPart = a.channel !== undefined ? `Ch${a.channel} → ${a.state ? "เปิด" : "ปิด"}` : "";
  const notifyPart = row.action_type === "both" || row.action_type === "notification" ? "+ แจ้งเตือน" : "";
  return [relayPart, notifyPart].filter(Boolean).join(" ");
}

const STATUS_BADGE: Record<string, string> = {
  executed: "bg-green-100 text-green-800",
  skipped: "bg-brand-100 text-brand-700",
  failed: "bg-red-100 text-red-800",
  triggered: "bg-blue-100 text-blue-800",
};

export function AutomationPanel({
  farmId,
  devices,
  relaysByDevice,
  sensors,
  initialRows,
  initialActivity,
  quota,
}: {
  farmId: string;
  devices: Device[];
  relaysByDevice: Record<string, Relay[]>;
  sensors: Sensor[];
  initialRows: AutomationRow[];
  initialActivity: ActivityRow[];
  quota: { used: number; limit: number | null };
}) {
  const [rows, setRows] = useState(initialRows);
  const [activity] = useState(initialActivity);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AutomationInput>(() => blankInput(devices[0]?.id ?? ""));
  const [showExtra, setShowExtra] = useState(false);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const active = rows.filter((r) => r.enabled).length;
  const disabled = rows.length - active;
  const atLimit = quota.limit !== null && quota.used >= quota.limit;

  const relaysForDevice = relaysByDevice[form.device_id] ?? [];
  const sensorsForDevice = useMemo(() => sensors.filter((s) => s.device_id === form.device_id), [sensors, form.device_id]);
  const rulesById = useMemo(() => new Map(rows.map((r) => [r.id, r.name])), [rows]);

  function patch(p: Partial<AutomationInput>) {
    setForm((f) => ({ ...f, ...p }));
  }

  function toggleDay(d: number) {
    setForm((f) => {
      const days = f.days ?? [];
      const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
      return { ...f, days: next };
    });
  }

  function submitCreate() {
    setMsg(null);
    startTransition(async () => {
      const r = await createAutomation(farmId, form);
      if (r.ok) {
        setMsg("✓ สร้าง Automation แล้ว");
        setShowForm(false);
        setShowExtra(false);
        setForm(blankInput(devices[0]?.id ?? ""));
        window.location.reload();
      } else {
        setMsg("✗ " + r.error);
      }
    });
  }

  function doToggle(id: string, enabled: boolean) {
    setBusyId(id);
    startTransition(async () => {
      const r = await toggleAutomation(farmId, id, enabled);
      if (r.ok) setRows((prev) => prev.map((row) => (row.id === id ? { ...row, enabled } : row)));
      setBusyId(null);
    });
  }

  function doDelete(id: string) {
    setBusyId(id);
    startTransition(async () => {
      const r = await deleteAutomation(farmId, id);
      if (r.ok) setRows((prev) => prev.filter((row) => row.id !== id));
      setBusyId(null);
    });
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4 text-center">
          <div className="text-2xl font-extrabold text-brand-800">{rows.length}</div>
          <div className="text-[11px] text-brand-900/50 uppercase tracking-wider mt-0.5">ทั้งหมด</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-extrabold text-green-700">{active}</div>
          <div className="text-[11px] text-brand-900/50 uppercase tracking-wider mt-0.5">Active</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-extrabold text-brand-900/40">{disabled}</div>
          <div className="text-[11px] text-brand-900/50 uppercase tracking-wider mt-0.5">Disabled</div>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
          <div>
            <h2 className="font-bold text-brand-800">รายการ Automation</h2>
            <p className="text-xs text-brand-900/50 mt-0.5">
              ใช้ {quota.used}/{quota.limit === null ? "ไม่จำกัด" : quota.limit}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm((s) => !s)}
            disabled={atLimit && !showForm}
            className="rounded-full bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold px-4 py-2 transition"
          >
            {showForm ? "ยกเลิก" : "+ เพิ่ม Automation"}
          </button>
        </div>
        {atLimit && !showForm && (
          <p className="text-xs text-amber-700 mt-1">ใช้ครบตามแพ็กเกจแล้ว ({quota.used}/{quota.limit}) — อัปเกรดเพื่อเพิ่มจำนวน</p>
        )}

        {showForm && (
          <div className="mt-4 rounded-xl border border-border p-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-brand-900/70 mb-1">ชื่อ Automation</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="เช่น รดน้ำเมื่อดินแห้ง"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              />
            </div>

            <div className="flex items-center gap-2">
              {(["sensor_value", "schedule"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => patch({ trigger_type: t })}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full transition ${
                    form.trigger_type === t ? "bg-brand-600 text-white" : "border border-border text-brand-800"
                  }`}
                >
                  {t === "sensor_value" ? "เงื่อนไข Sensor" : "ตั้งเวลา"}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-xs font-semibold text-brand-900/70 mb-1">อุปกรณ์</label>
              <select
                value={form.device_id}
                onChange={(e) => patch({ device_id: e.target.value, sensor_id: undefined })}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              >
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.device_name}
                  </option>
                ))}
              </select>
            </div>

            {form.trigger_type === "sensor_value" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-brand-900/70">ถ้า</span>
                  <select
                    value={form.sensor_id ?? ""}
                    onChange={(e) => patch({ sensor_id: e.target.value })}
                    className="rounded-lg border border-border px-2 py-1.5 text-xs"
                  >
                    <option value="">-- เลือก Sensor --</option>
                    {sensorsForDevice.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.sensor_type})
                      </option>
                    ))}
                  </select>
                  <select
                    value={form.operator}
                    onChange={(e) => patch({ operator: e.target.value as AutomationInput["operator"] })}
                    className="rounded-lg border border-border px-2 py-1.5 text-xs"
                  >
                    {OPERATORS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={form.value}
                    onChange={(e) => patch({ value: Number(e.target.value) })}
                    className="w-24 rounded-lg border border-border px-2 py-1.5 text-xs"
                  />
                </div>

                {!showExtra ? (
                  <button type="button" onClick={() => setShowExtra(true)} className="text-xs text-brand-700 hover:text-brand-900 underline">
                    + เพิ่มเงื่อนไขที่ 2 (AND/OR)
                  </button>
                ) : (
                  <div className="rounded-lg bg-brand-50 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      {(["AND", "OR"] as const).map((l) => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => patch({ logic: l })}
                          className={`text-[11px] font-bold px-2.5 py-1 rounded-full transition ${
                            (form.logic ?? "AND") === l ? "bg-brand-600 text-white" : "border border-border text-brand-800"
                          }`}
                        >
                          {l}
                        </button>
                      ))}
                      <span className="text-xs text-brand-900/70">แล้ว</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={form.extra_sensor_id ?? ""}
                        onChange={(e) => patch({ extra_sensor_id: e.target.value })}
                        className="rounded-lg border border-border px-2 py-1.5 text-xs"
                      >
                        <option value="">-- เลือก Sensor --</option>
                        {sensors.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.sensor_type})
                          </option>
                        ))}
                      </select>
                      <select
                        value={form.extra_operator ?? "<"}
                        onChange={(e) => patch({ extra_operator: e.target.value as AutomationInput["extra_operator"] })}
                        className="rounded-lg border border-border px-2 py-1.5 text-xs"
                      >
                        {OPERATORS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={form.extra_value ?? 0}
                        onChange={(e) => patch({ extra_value: Number(e.target.value) })}
                        className="w-24 rounded-lg border border-border px-2 py-1.5 text-xs"
                      />
                      <button type="button" onClick={() => { setShowExtra(false); patch({ extra_sensor_id: undefined }); }} className="text-[11px] text-red-600 hover:text-red-800">
                        ลบเงื่อนไขที่ 2
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  {DAY_LABELS.map((label, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleDay(i)}
                      className={`w-8 h-8 rounded text-xs font-bold transition ${
                        (form.days ?? []).includes(i) ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-900/40 border border-border"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <input
                  type="time"
                  value={`${String(form.hour ?? 0).padStart(2, "0")}:${String(form.minute ?? 0).padStart(2, "0")}`}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(":").map(Number);
                    patch({ hour: h || 0, minute: m || 0 });
                  }}
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                />
              </div>
            )}

            <div className="border-t border-border pt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-brand-900/70">แล้วสั่ง</span>
              <select
                value={form.channel}
                onChange={(e) => patch({ channel: Number(e.target.value) })}
                className="rounded-lg border border-border px-2 py-1.5 text-xs"
              >
                {relaysForDevice.map((r) => (
                  <option key={r.channel} value={r.channel}>
                    Ch{r.channel} · {r.name}
                  </option>
                ))}
              </select>
              <select
                value={form.state ? "on" : "off"}
                onChange={(e) => patch({ state: e.target.value === "on" })}
                className="rounded-lg border border-border px-2 py-1.5 text-xs"
              >
                <option value="on">เปิด</option>
                <option value="off">ปิด</option>
              </select>
              <label className="flex items-center gap-1.5 text-xs text-brand-900/70">
                <input type="checkbox" checked={form.notify} onChange={(e) => patch({ notify: e.target.checked })} className="rounded border-border text-brand-600" />
                แจ้งเตือนด้วย
              </label>
              <label className="flex items-center gap-1.5 text-xs text-brand-900/70 ml-auto">
                Cooldown
                <input
                  type="number"
                  value={form.cooldown_seconds}
                  min={0}
                  onChange={(e) => patch({ cooldown_seconds: Number(e.target.value) })}
                  className="w-20 rounded-lg border border-border px-2 py-1 text-xs"
                />
                วินาที
              </label>
            </div>

            {msg && <p className="text-xs text-brand-900/70">{msg}</p>}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={submitCreate}
                disabled={pending || !form.name.trim() || relaysForDevice.length === 0}
                className="rounded-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2 transition"
              >
                {pending ? "กำลังบันทึก..." : "บันทึก + เปิดใช้งาน"}
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-2">
          {rows.length === 0 ? (
            <p className="text-sm text-brand-900/50">ยังไม่มี Automation</p>
          ) : (
            rows.map((row) => {
              const device = devices.find((d) => d.id === row.device_id);
              return (
                <div key={row.id} className="rounded-lg border border-border p-3 flex flex-wrap items-center gap-3">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    disabled={busyId === row.id}
                    onChange={(e) => doToggle(row.id, e.target.checked)}
                    className="rounded border-border text-brand-600"
                  />
                  <div className="min-w-[160px]">
                    <div className="text-sm font-semibold text-brand-800">{row.name}</div>
                    <div className="text-[11px] text-brand-900/50">{device?.device_name ?? ""}</div>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 shrink-0">
                    {row.trigger_type === "schedule" ? "ตั้งเวลา" : "Sensor"}
                  </span>
                  <div className="text-xs text-brand-900/70 flex-1 min-w-[200px]">{triggerSummary(row)}</div>
                  <div className="text-xs text-brand-900/70">{actionSummary(row)}</div>
                  <button
                    type="button"
                    onClick={() => doDelete(row.id)}
                    disabled={busyId === row.id}
                    className="text-[11px] text-red-600 hover:text-red-800 font-medium ml-auto"
                  >
                    ลบ
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-bold text-brand-800 mb-3">กิจกรรมล่าสุด</h2>
        {activity.length === 0 ? (
          <p className="text-sm text-brand-900/50">ยังไม่มีกิจกรรม</p>
        ) : (
          <div className="space-y-1.5">
            {activity.map((log) => (
              <div key={log.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[log.status] ?? "bg-brand-100 text-brand-700"}`}>
                  {log.status}
                </span>
                <span className="text-brand-900/80">{rulesById.get(log.rule_id) ?? "(ลบแล้ว)"}</span>
                {log.skip_reason && <span className="text-brand-900/40">— {log.skip_reason}</span>}
                <span className="text-brand-900/40 ml-auto">{new Date(log.executed_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
