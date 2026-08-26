"use client";

import { useEffect, useMemo, useState } from "react";
import { FarmWeatherSection, type ZoneSummary, type CropAdvisory } from "./FarmWeatherSection";

type Farm = { id: string; name: string };
type Device = { id: string; device_name: string; farm_id: string };

type AnalysisResult = {
  summary: string;
  status: "good" | "attention" | "critical";
  insights: string[];
  anomalies: string[];
  recommendations: string[];
  metrics: { label: string; value: string }[];
  crop_advisory: CropAdvisory;
  zone: ZoneSummary | null;
  cached?: boolean;
};

type ChatTurn = { role: "user" | "assistant"; content: string };

const PERIODS = [
  { days: 1, label: "24 ชั่วโมง" },
  { days: 7, label: "7 วัน" },
  { days: 14, label: "14 วัน" },
];

const STATUS_LABEL: Record<AnalysisResult["status"], { label: string; cls: string }> = {
  good: { label: "Good", cls: "bg-green-100 text-green-800" },
  attention: { label: "Attention", cls: "bg-amber-100 text-amber-800" },
  critical: { label: "Critical", cls: "bg-red-100 text-red-800" },
};

export function AiAnalysisClient({ farms, devices, advanced }: { farms: Farm[]; devices: Device[]; advanced: boolean }) {
  const options = useMemo(() => {
    const list: { value: string; label: string }[] = [];
    if (advanced) {
      for (const f of farms) {
        const count = devices.filter((d) => d.farm_id === f.id).length;
        if (count > 0) list.push({ value: `farm:${f.id}`, label: `📊 ทุกอุปกรณ์ในฟาร์ม ${f.name} (${count})` });
      }
    }
    for (const d of devices) list.push({ value: `device:${d.id}`, label: d.device_name });
    return list;
  }, [farms, devices, advanced]);

  const [selected, setSelected] = useState(options[0]?.value ?? "");
  const [periodDays, setPeriodDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const currentFarmId = useMemo(() => {
    const [kind, id] = selected.split(":");
    if (kind === "farm") return id;
    return devices.find((d) => d.id === id)?.farm_id ?? null;
  }, [selected, devices]);

  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);

  useEffect(() => {
    setVoiceSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    setVoiceOn(typeof window !== "undefined" && localStorage.getItem("ai_voice_on") === "1");
  }, []);

  function speak(text: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "th-TH";
    window.speechSynthesis.speak(utter);
  }

  function toggleVoice() {
    const next = !voiceOn;
    setVoiceOn(next);
    localStorage.setItem("ai_voice_on", next ? "1" : "0");
    if (!next && typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  function scopeBody() {
    const [kind, id] = selected.split(":");
    return kind === "farm" ? { scope: "farm", farm_id: id, period_days: periodDays } : { scope: "device", device_id: id, period_days: periodDays };
  }

  async function handleAnalyze() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scopeBody()),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "AI service is temporarily unavailable.");
        setResult(null);
      } else {
        setResult(data);
      }
    } catch {
      setError("AI service is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }

  // Auto-load the advisory when the page opens or the selection changes —
  // weather (FarmWeatherSection, below) fetches independently and never
  // waits on this, so the farmer sees real weather immediately even if the
  // AI call is slow. Cache/quota from the API route still applies, so
  // switching back and forth doesn't burn extra provider calls.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    handleAnalyze();
  }, [selected]);

  async function handleSend() {
    const question = chatInput.trim();
    if (!question || !selected) return;
    setChatInput("");
    setChatError(null);
    setChatLoading(true);
    const nextMessages: ChatTurn[] = [...messages, { role: "user", content: question }];
    setMessages(nextMessages);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...scopeBody(), history: messages, question }),
      });
      const data = await res.json();
      if (!res.ok) {
        setChatError(data.error ?? "AI service is temporarily unavailable.");
        return;
      }
      setMessages([...nextMessages, { role: "assistant", content: data.answer }]);
      if (voiceOn) speak(data.answer);
    } catch {
      setChatError("AI service is temporarily unavailable.");
    } finally {
      setChatLoading(false);
    }
  }

  if (options.length === 0) {
    return (
      <div className="card p-10 text-center">
        <div className="text-4xl">🤖</div>
        <div className="mt-3 font-semibold text-brand-800">ยังไม่มีอุปกรณ์ให้วิเคราะห์</div>
        <p className="mt-1 text-sm text-brand-900/60">เพิ่มอุปกรณ์ IoT ก่อน จึงจะใช้ AI Analysis ได้</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {currentFarmId && (
        <FarmWeatherSection
          key={currentFarmId}
          farmId={currentFarmId}
          zone={result?.zone}
          status={result?.status}
          cropAdvisory={result?.crop_advisory}
          advisoryLoading={loading}
        />
      )}

      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setResult(null);
              setMessages([]);
            }}
            className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-brand-800 flex-1 min-w-[200px]"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1.5">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => setPeriodDays(p.days)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition ${
                  periodDays === p.days ? "bg-brand-600 text-white" : "border border-border text-brand-800 hover:border-brand-400"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={loading}
          className="mt-4 w-full rounded-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 transition"
        >
          {loading ? "กำลังวิเคราะห์..." : "🤖 Analyze"}
        </button>
        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      </div>

      {(result || loading) && (
        <div className="px-1">
          <h2 className="text-sm font-bold text-brand-900/70 uppercase tracking-wider">🌱 คำแนะนำสำหรับฟาร์ม</h2>
        </div>
      )}

      {!result && loading && (
        <div className="card p-6">
          <div className="h-16 flex items-center justify-center text-sm text-brand-900/40">กำลังวิเคราะห์ข้อมูลฟาร์ม...</div>
        </div>
      )}

      {result && (
        <>
          <div className="card p-6">
            <div className="flex items-center justify-between gap-3 mb-2">
              <h2 className="font-bold text-brand-800">สรุป</h2>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${STATUS_LABEL[result.status].cls}`}>
                {STATUS_LABEL[result.status].label}
              </span>
            </div>
            <p className="text-sm text-brand-900/85">{result.summary}</p>
            {result.cached && <p className="mt-1 text-[11px] text-brand-900/40">ผลจากการวิเคราะห์ล่าสุด (cached)</p>}
            {result.metrics.length > 0 && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {result.metrics.map((m, i) => (
                  <div key={i} className="rounded-lg bg-brand-50 px-3 py-2">
                    <div className="text-[10px] text-brand-900/50 uppercase tracking-wider">{m.label}</div>
                    <div className="text-sm font-bold text-brand-800">{m.value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {result.insights.length > 0 && (
            <div className="card p-6">
              <h2 className="font-bold text-brand-800 mb-2">Insights</h2>
              <ul className="space-y-1.5 text-sm text-brand-900/85">
                {result.insights.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-brand-400">•</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.anomalies.length > 0 && (
            <div className="card p-6 border-amber-200">
              <h2 className="font-bold text-amber-800 mb-2">Anomalies</h2>
              <ul className="space-y-1.5 text-sm text-amber-900/85">
                {result.anomalies.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-amber-500">⚠</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.recommendations.length > 0 && (
            <div className="card p-6">
              <h2 className="font-bold text-brand-800 mb-2">Recommendations</h2>
              <ul className="space-y-1.5 text-sm text-brand-900/85">
                {result.recommendations.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-green-500">✓</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <div className="card p-6">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h2 className="font-bold text-brand-800">Ask AI</h2>
          {voiceSupported && (
            <button
              type="button"
              onClick={toggleVoice}
              className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition ${
                voiceOn ? "bg-brand-600 text-white" : "border border-border text-brand-800 hover:border-brand-400"
              }`}
              title={voiceOn ? "ปิดเสียงอ่านคำตอบ" : "เปิดเสียงอ่านคำตอบ"}
            >
              {voiceOn ? "🔊 เสียงเปิด" : "🔇 เสียงปิด"}
            </button>
          )}
        </div>
        <p className="text-xs text-brand-900/50 mb-3">ถาม AI เกี่ยวกับฟาร์มของคุณ — สภาพอากาศ, ค่า Sensor, หรือความรู้การเกษตรทั่วไป</p>

        {messages.length > 0 && (
          <div className="space-y-2 mb-3 max-h-72 overflow-y-auto">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`rounded-lg px-3 py-2 text-sm ${
                  m.role === "user" ? "bg-brand-600 text-white ml-8" : "bg-brand-50 text-brand-900/85 mr-8"
                }`}
              >
                {m.content}
              </div>
            ))}
          </div>
        )}
        {chatError && <p className="text-xs text-red-700 mb-2">{chatError}</p>}

        <div className="flex items-center gap-2">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !chatLoading) handleSend();
            }}
            placeholder="ถาม AI เกี่ยวกับอุปกรณ์ของคุณ..."
            className="flex-1 rounded-full border border-border px-4 py-2 text-sm outline-none focus:border-brand-500"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={chatLoading || !chatInput.trim()}
            className="rounded-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 transition"
          >
            {chatLoading ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
