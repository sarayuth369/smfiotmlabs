"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { saveSchedule, saveRules } from "../actions";
import type { ScheduleEntry, RuleEntry } from "../actions";

type Relay = { channel: number; name: string };

const DAY_LABELS = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"]; // index 0=Monday..6=Sunday, matches ScheduleModel

const SOURCE_OPTIONS: { key: string; label: string }[] = [
  { key: "ph", label: "ค่า pH" },
  { key: "ec", label: "ค่า EC" },
  { key: "n", label: "ไนโตรเจน (N)" },
  { key: "p", label: "ฟอสฟอรัส (P)" },
  { key: "k", label: "โพแทสเซียม (K)" },
  { key: "moist", label: "ความชื้นดิน" },
  { key: "temp", label: "อุณหภูมิ" },
  { key: "hum", label: "ความชื้นอากาศ" },
  { key: "lux", label: "ความสว่าง" },
  { key: "volt", label: "แรงดัน (V)" },
  { key: "amp", label: "กระแส (A)" },
  { key: "watt", label: "กำลังไฟ (W)" },
];

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60)
    .toString()
    .padStart(2, "0");
  const mm = (m % 60).toString().padStart(2, "0");
  return `${h}:${mm}`;
}
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function defaultSchedule(ch: number): ScheduleEntry {
  return { ch, en: false, on: 6 * 60, off: 18 * 60, days: 127 };
}
function blankRule(ch: number): RuleEntry {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    en: true,
    src: "ph",
    cmp: "lt",
    val: 6,
    ch,
    act: true,
    nl: false,
  };
}

export function DeviceRulesPanel({
  deviceId,
  deviceName,
  deviceUid,
  farmId,
  relays,
  initialSchedules,
  initialRules,
}: {
  deviceId: string;
  deviceName: string;
  deviceUid: string;
  farmId: string;
  relays: Relay[];
  initialSchedules: ScheduleEntry[];
  initialRules: RuleEntry[];
}) {
  const relayChannels = relays.map((r) => r.channel);
  const relayNameByChannel = new Map(relays.map((r) => [r.channel, r.name]));

  const [schedules, setSchedules] = useState<ScheduleEntry[]>(() => {
    const byCh = new Map(initialSchedules.map((s) => [s.ch, s]));
    return relayChannels.map((ch) => byCh.get(ch) ?? defaultSchedule(ch));
  });
  const [rules, setRules] = useState<RuleEntry[]>(initialRules);

  const [pendingSchedule, startScheduleSave] = useTransition();
  const [pendingRules, startRulesSave] = useTransition();
  const [scheduleMsg, setScheduleMsg] = useState<string | null>(null);
  const [rulesMsg, setRulesMsg] = useState<string | null>(null);

  function updateSchedule(ch: number, patch: Partial<ScheduleEntry>) {
    setSchedules((prev) => prev.map((s) => (s.ch === ch ? { ...s, ...patch } : s)));
  }
  function toggleDay(ch: number, dayIndex: number) {
    setSchedules((prev) =>
      prev.map((s) => (s.ch === ch ? { ...s, days: s.days ^ (1 << dayIndex) } : s))
    );
  }

  function doSaveSchedule() {
    setScheduleMsg(null);
    startScheduleSave(async () => {
      const r = await saveSchedule(deviceId, schedules);
      setScheduleMsg(r.ok ? "✓ ส่งไปยัง ESP32 แล้ว" : "✗ " + r.error);
    });
  }

  function updateRule(id: string, patch: Partial<RuleEntry>) {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function addRule() {
    setRules((prev) => [...prev, blankRule(relayChannels[0] ?? 1)]);
  }
  function removeRule(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id));
  }
  function doSaveRules() {
    setRulesMsg(null);
    startRulesSave(async () => {
      const r = await saveRules(deviceId, rules);
      setRulesMsg(r.ok ? "✓ ส่งไปยัง ESP32 แล้ว" : "✗ " + r.error);
    });
  }

  return (
    <div className="card p-5 space-y-6">
      <div>
        <div className="font-bold text-brand-800">{deviceName}</div>
        <div className="font-mono text-xs text-brand-900/55">{deviceUid}</div>
      </div>

      {/* Schedule */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-brand-900/70 uppercase tracking-wider">
            ตั้งเวลาเปิด/ปิด Relay
          </h3>
          {relayChannels.length > 0 && (
            <div className="flex items-center gap-2">
              {scheduleMsg && <span className="text-xs text-brand-900/60">{scheduleMsg}</span>}
              <button
                type="button"
                onClick={doSaveSchedule}
                disabled={pendingSchedule}
                className="rounded-full bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-3.5 py-1.5 disabled:opacity-50"
              >
                {pendingSchedule ? "กำลังส่ง..." : "บันทึก + ส่งไปยัง ESP32"}
              </button>
            </div>
          )}
        </div>
        {relayChannels.length === 0 ? (
          <p className="text-sm text-brand-900/50">
            ยังไม่มี Relay ที่ถูกสร้างขึ้น —{" "}
            <Link href={`/dashboard/farms/${farmId}/controls`} className="text-brand-700 hover:text-brand-900 underline">
              ไปที่ Controls เพื่อเพิ่ม Relay
            </Link>
          </p>
        ) : (
        <div className="space-y-3">
          {schedules.map((s) => (
            <div key={s.ch} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-brand-800 w-32 shrink-0">
                  <input
                    type="checkbox"
                    checked={s.en}
                    onChange={(e) => updateSchedule(s.ch, { en: e.target.checked })}
                    className="rounded border-border text-brand-600"
                  />
                  Ch{s.ch} · {relayNameByChannel.get(s.ch) ?? ""}
                </label>
                <label className="flex items-center gap-1.5 text-xs text-brand-900/70">
                  เปิด
                  <input
                    type="time"
                    value={minutesToTime(s.on)}
                    onChange={(e) => updateSchedule(s.ch, { on: timeToMinutes(e.target.value) })}
                    className="rounded border border-border px-1.5 py-1 text-xs"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-xs text-brand-900/70">
                  ปิด
                  <input
                    type="time"
                    value={minutesToTime(s.off)}
                    onChange={(e) => updateSchedule(s.ch, { off: timeToMinutes(e.target.value) })}
                    className="rounded border border-border px-1.5 py-1 text-xs"
                  />
                </label>
                <div className="flex items-center gap-1">
                  {DAY_LABELS.map((label, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleDay(s.ch, i)}
                      className={`w-6 h-6 rounded text-[10px] font-bold transition ${
                        s.days & (1 << i)
                          ? "bg-brand-600 text-white"
                          : "bg-brand-50 text-brand-900/40 border border-border"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>

      {/* Automation rules */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-brand-900/70 uppercase tracking-wider">
            กฎอัตโนมัติตามค่าเซนเซอร์
          </h3>
          <div className="flex items-center gap-2">
            {rulesMsg && <span className="text-xs text-brand-900/60">{rulesMsg}</span>}
            <button
              type="button"
              onClick={addRule}
              disabled={relayChannels.length === 0}
              className="rounded-full border border-brand-200 hover:border-brand-400 text-brand-800 text-xs font-semibold px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              + เพิ่มกฎ
            </button>
            <button
              type="button"
              onClick={doSaveRules}
              disabled={pendingRules}
              className="rounded-full bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-3.5 py-1.5 disabled:opacity-50"
            >
              {pendingRules ? "กำลังส่ง..." : "บันทึก + ส่งไปยัง ESP32"}
            </button>
          </div>
        </div>

        {relayChannels.length === 0 ? (
          <p className="text-sm text-brand-900/50">
            ยังไม่มี Relay ที่ถูกสร้างขึ้น —{" "}
            <Link href={`/dashboard/farms/${farmId}/controls`} className="text-brand-700 hover:text-brand-900 underline">
              ไปที่ Controls เพื่อเพิ่ม Relay
            </Link>
          </p>
        ) : rules.length === 0 ? (
          <p className="text-sm text-brand-900/50">ยังไม่มีกฎ</p>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className="rounded-lg border border-border p-3 flex flex-wrap items-center gap-2">
                <input
                  type="checkbox"
                  checked={r.en}
                  onChange={(e) => updateRule(r.id, { en: e.target.checked })}
                  className="rounded border-border text-brand-600"
                />
                <span className="text-xs text-brand-900/70">ถ้า</span>
                <select
                  value={r.src}
                  onChange={(e) => updateRule(r.id, { src: e.target.value })}
                  className="rounded border border-border px-1.5 py-1 text-xs"
                >
                  {SOURCE_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <select
                  value={r.cmp}
                  onChange={(e) => updateRule(r.id, { cmp: e.target.value as "gt" | "lt" })}
                  className="rounded border border-border px-1.5 py-1 text-xs"
                >
                  <option value="gt">{">"}</option>
                  <option value="lt">{"<"}</option>
                </select>
                <input
                  type="number"
                  value={r.val}
                  onChange={(e) => updateRule(r.id, { val: Number(e.target.value) })}
                  className="rounded border border-border px-1.5 py-1 text-xs w-20"
                />
                <span className="text-xs text-brand-900/70">→ Ch</span>
                <select
                  value={r.ch}
                  onChange={(e) => updateRule(r.id, { ch: Number(e.target.value) })}
                  className="rounded border border-border px-1.5 py-1 text-xs"
                >
                  {relayChannels.map((c) => (
                    <option key={c} value={c}>
                      Ch{c} · {relayNameByChannel.get(c) ?? ""}
                    </option>
                  ))}
                </select>
                <select
                  value={r.act ? "on" : "off"}
                  onChange={(e) => updateRule(r.id, { act: e.target.value === "on" })}
                  className="rounded border border-border px-1.5 py-1 text-xs"
                >
                  <option value="on">เปิด</option>
                  <option value="off">ปิด</option>
                </select>
                <label className="flex items-center gap-1 text-[11px] text-brand-900/70">
                  <input
                    type="checkbox"
                    checked={r.nl}
                    onChange={(e) => updateRule(r.id, { nl: e.target.checked })}
                    className="rounded border-border text-brand-600"
                  />
                  แจ้ง LINE
                </label>
                <button
                  type="button"
                  onClick={() => removeRule(r.id)}
                  className="ml-auto text-[11px] text-red-600 hover:text-red-800 font-medium"
                >
                  ลบ
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
