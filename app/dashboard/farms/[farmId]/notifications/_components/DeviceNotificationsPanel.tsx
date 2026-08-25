"use client";

import { useState, useTransition } from "react";
import { saveLineConfig, saveSheetsConfig } from "../actions";
import type { LineConfig, SheetsConfig } from "../actions";

const LINE_DEFAULT_PUSH_URL = "https://api.line.me/v2/bot/message/push";

// LINE daily-report day bitmask: bit0=Sunday..bit6=Saturday (matches
// LineConfigModel.dailyReportDaysMask in Flutter — DIFFERENT convention
// from the Rules tab's schedule bitmask, which is Monday-first).
const LINE_DAY_LABELS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60).toString().padStart(2, "0");
  const mm = (m % 60).toString().padStart(2, "0");
  return `${h}:${mm}`;
}
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function DeviceNotificationsPanel({
  deviceId,
  deviceName,
  deviceUid,
  initialLine,
  initialSheets,
}: {
  deviceId: string;
  deviceName: string;
  deviceUid: string;
  initialLine: LineConfig;
  initialSheets: SheetsConfig;
}) {
  const [line, setLine] = useState<LineConfig>(initialLine);
  const [sheets, setSheets] = useState<SheetsConfig>(initialSheets);
  const [pendingLine, startLineSave] = useTransition();
  const [pendingSheets, startSheetsSave] = useTransition();
  const [lineMsg, setLineMsg] = useState<string | null>(null);
  const [sheetsMsg, setSheetsMsg] = useState<string | null>(null);
  const [showLineTok, setShowLineTok] = useState(false);
  const [showSheetsTok, setShowSheetsTok] = useState(false);

  function doSaveLine() {
    setLineMsg(null);
    startLineSave(async () => {
      const r = await saveLineConfig(deviceId, line);
      setLineMsg(r.ok ? "✓ ส่งไปยัง ESP32 แล้ว" : "✗ " + r.error);
    });
  }
  function doSaveSheets() {
    setSheetsMsg(null);
    startSheetsSave(async () => {
      const r = await saveSheetsConfig(deviceId, sheets);
      setSheetsMsg(r.ok ? "✓ ส่งไปยัง ESP32 แล้ว" : "✗ " + r.error);
    });
  }

  return (
    <div className="card p-5 space-y-6">
      <div>
        <div className="font-bold text-brand-800">{deviceName}</div>
        <div className="font-mono text-xs text-brand-900/55">{deviceUid}</div>
      </div>

      {/* LINE */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-brand-900/70 uppercase tracking-wider">แจ้งเตือนผ่าน LINE</h3>
          <div className="flex items-center gap-2">
            {lineMsg && <span className="text-xs text-brand-900/60">{lineMsg}</span>}
            <button
              type="button"
              onClick={doSaveLine}
              disabled={pendingLine}
              className="rounded-full bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-3.5 py-1.5 disabled:opacity-50"
            >
              {pendingLine ? "กำลังส่ง..." : "บันทึก + ส่งไปยัง ESP32"}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-brand-800">
            <input
              type="checkbox"
              checked={line.en}
              onChange={(e) => setLine((s) => ({ ...s, en: e.target.checked }))}
              className="rounded border-border text-brand-600"
            />
            เปิดใช้งานแจ้งเตือน LINE
          </label>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-brand-900/70 mb-1">Push URL</label>
              <input
                value={line.url}
                onChange={(e) => setLine((s) => ({ ...s, url: e.target.value }))}
                placeholder={LINE_DEFAULT_PUSH_URL}
                className="w-full rounded-lg border border-border px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-900/70 mb-1">User/Group ID</label>
              <input
                value={line.uid}
                onChange={(e) => setLine((s) => ({ ...s, uid: e.target.value }))}
                placeholder="U..."
                className="w-full rounded-lg border border-border px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-brand-900/70 mb-1">Channel Access Token</label>
            <div className="flex gap-2">
              <input
                type={showLineTok ? "text" : "password"}
                value={line.tok}
                onChange={(e) => setLine((s) => ({ ...s, tok: e.target.value }))}
                className="flex-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-mono"
              />
              <button
                type="button"
                onClick={() => setShowLineTok((v) => !v)}
                className="text-xs rounded-lg border border-border px-2.5 py-1.5"
              >
                {showLineTok ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-brand-900/80">
            <input
              type="checkbox"
              checked={line.on}
              onChange={(e) => setLine((s) => ({ ...s, on: e.target.checked }))}
              className="rounded border-border text-brand-600"
            />
            แจ้งเตือนเมื่ออุปกรณ์กลับมาออนไลน์
          </label>

          <div className="rounded-lg border border-border p-3 space-y-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-brand-800">
              <input
                type="checkbox"
                checked={line.dr}
                onChange={(e) => setLine((s) => ({ ...s, dr: e.target.checked }))}
                className="rounded border-border text-brand-600"
              />
              รายงานประจำวัน
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-brand-900/70">
                เวลา
                <input
                  type="time"
                  value={minutesToTime(line.hm)}
                  onChange={(e) => setLine((s) => ({ ...s, hm: timeToMinutes(e.target.value) }))}
                  className="rounded border border-border px-1.5 py-1 text-xs"
                />
              </label>
              <div className="flex items-center gap-1">
                {LINE_DAY_LABELS.map((label, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setLine((s) => ({ ...s, dow: s.dow ^ (1 << i) }))}
                    className={`w-6 h-6 rounded text-[10px] font-bold transition ${
                      line.dow & (1 << i)
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
        </div>
      </div>

      {/* Google Sheets */}
      <div className="border-t border-border pt-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-brand-900/70 uppercase tracking-wider">บันทึกลง Google Sheet</h3>
          <div className="flex items-center gap-2">
            {sheetsMsg && <span className="text-xs text-brand-900/60">{sheetsMsg}</span>}
            <button
              type="button"
              onClick={doSaveSheets}
              disabled={pendingSheets}
              className="rounded-full bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-3.5 py-1.5 disabled:opacity-50"
            >
              {pendingSheets ? "กำลังส่ง..." : "บันทึก + ส่งไปยัง ESP32"}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-brand-800">
            <input
              type="checkbox"
              checked={sheets.en}
              onChange={(e) => setSheets((s) => ({ ...s, en: e.target.checked }))}
              className="rounded border-border text-brand-600"
            />
            เปิดใช้งานบันทึกลง Google Sheet
          </label>

          <div>
            <label className="block text-xs font-semibold text-brand-900/70 mb-1">
              Apps Script Web App URL
            </label>
            <input
              value={sheets.url}
              onChange={(e) => setSheets((s) => ({ ...s, url: e.target.value }))}
              placeholder="https://script.google.com/macros/s/AKfycb.../exec"
              className="w-full rounded-lg border border-border px-2.5 py-1.5 text-xs font-mono"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-brand-900/70 mb-1">Token</label>
              <div className="flex gap-2">
                <input
                  type={showSheetsTok ? "text" : "password"}
                  value={sheets.tok}
                  onChange={(e) => setSheets((s) => ({ ...s, tok: e.target.value }))}
                  className="flex-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowSheetsTok((v) => !v)}
                  className="text-xs rounded-lg border border-border px-2.5 py-1.5"
                >
                  {showSheetsTok ? "🙈" : "👁"}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-brand-900/70 mb-1">ความถี่บันทึก</label>
              <select
                value={sheets.iv}
                onChange={(e) => setSheets((s) => ({ ...s, iv: Number(e.target.value) }))}
                className="w-full rounded-lg border border-border px-2.5 py-1.5 text-xs"
              >
                <option value={10}>ทุก 10 นาที</option>
                <option value={20}>ทุก 20 นาที</option>
                <option value={30}>ทุก 30 นาที</option>
                <option value={60}>ทุก 60 นาที</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
