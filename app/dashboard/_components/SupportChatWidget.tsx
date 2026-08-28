"use client";

import { useEffect, useRef, useState } from "react";

type ChatTurn = { role: "user" | "assistant"; content: string };

type ConfigResponse = {
  enabled: boolean;
  assistant_name?: string;
  welcome_message?: string;
};

const QUICK_ACTIONS = [
  { label: "อุปกรณ์เชื่อมต่อไม่ได้", text: "อุปกรณ์ของฉันเชื่อมต่อไม่ได้ ต้องทำยังไงคะ" },
  { label: "แพ็กเกจและราคา", text: "อยากทราบแพ็กเกจและราคาค่ะ" },
  { label: "การชำระเงิน", text: "สอบถามเรื่องการชำระเงิน/ใบเสร็จค่ะ" },
  { label: "ติดต่อเจ้าหน้าที่", text: "ขอคุยกับเจ้าหน้าที่ค่ะ" },
];

export function SupportChatWidget() {
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [assistantName, setAssistantName] = useState("Support");
  const [welcome, setWelcome] = useState("");
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [status, setStatus] = useState("AI_ACTIVE");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
  const [suggestEscalation, setSuggestEscalation] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/support/conversation")
      .then((r) => r.json())
      .then((data: ConfigResponse) => {
        setEnabled(!!data.enabled);
        if (data.enabled) {
          setAssistantName(data.assistant_name || "Support");
          setWelcome(data.welcome_message || "");
        }
      })
      .catch(() => setEnabled(false))
      .finally(() => setReady(true));
  }, []);

  // Every time the widget is opened, start a brand-new conversation —
  // previous ones stay in the DB (visible to admin/history) but are never
  // auto-restored into the chat window.
  useEffect(() => {
    if (!open) return;
    setMessages([]);
    setConversationId(null);
    setStatus("AI_ACTIVE");
    setSuggestEscalation(false);
    setError(null);
    setLastFailedMessage(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open, loading]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading || status === "ESCALATED") return;
    setInput("");
    setError(null);
    setLastFailedMessage(null);
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setLoading(true);
    try {
      const res = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, conversation_id: conversationId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "ขออภัยค่ะ ระบบขัดข้องชั่วคราว");
        setLastFailedMessage(trimmed);
        return;
      }
      if (data.conversation_id) setConversationId(data.conversation_id);
      if (data.status === "ESCALATED") {
        setStatus("ESCALATED");
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      setSuggestEscalation(!!data.suggest_escalation);
    } catch {
      setError("ขออภัยค่ะ ระบบขัดข้องชั่วคราว");
      setLastFailedMessage(trimmed);
    } finally {
      setLoading(false);
    }
  }

  async function confirmEscalate() {
    setEscalating(true);
    try {
      const res = await fetch("/api/support/escalate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: messages.filter((m) => m.role === "user").slice(-1)[0]?.content ?? "",
          conversation_id: conversationId,
        }),
      });
      if (res.ok) {
        setStatus("ESCALATED");
        setSuggestEscalation(false);
        setMessages((prev) => [...prev, { role: "assistant", content: "ส่งเรื่องต่อให้ทีม Support แล้วนะคะ 😊 ทีมงานจะติดต่อกลับโดยเร็วที่สุดค่ะ" }]);
      }
    } finally {
      setEscalating(false);
    }
  }

  if (!ready || !enabled) return null;

  return (
    <div className="fixed bottom-5 right-5 z-40">
      {open && (
        <div className="mb-3 w-[92vw] max-w-sm h-[70vh] max-h-[560px] card p-0 flex flex-col overflow-hidden shadow-2xl">
          <div className="bg-brand-600 text-white px-4 py-3 flex items-center justify-between shrink-0">
            <div>
              <div className="font-bold text-sm">{assistantName}</div>
              <div className="text-[11px] text-white/75">SMF IoT Support</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="text-white/80 hover:text-white text-lg leading-none px-1">
              ×
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {welcome && messages.length === 0 && (
              <div className="rounded-lg px-3 py-2 text-sm bg-brand-50 text-brand-900/85 mr-8">{welcome}</div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === "user" ? "bg-brand-600 text-white ml-8" : "bg-brand-50 text-brand-900/85 mr-8"
                }`}
              >
                {m.content}
              </div>
            ))}
            {loading && (
              <div className="rounded-lg px-3 py-2 text-sm bg-brand-50 text-brand-900/50 mr-8">
                {assistantName}กำลังพิมพ์...
              </div>
            )}
            {status === "ESCALATED" && (
              <div className="rounded-lg px-3 py-2 text-xs bg-amber-50 text-amber-900 border border-amber-200">
                🙋 ทีม Support รับเรื่องแล้ว รอการติดต่อกลับนะคะ
              </div>
            )}
          </div>

          {error && (
            <div className="px-3 pb-1 shrink-0">
              <p className="text-xs text-red-700">{error}</p>
              {lastFailedMessage && (
                <button type="button" onClick={() => sendMessage(lastFailedMessage)} className="text-xs font-semibold text-brand-700 underline">
                  ลองใหม่
                </button>
              )}
            </div>
          )}

          {suggestEscalation && status !== "ESCALATED" && (
            <div className="mx-3 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 shrink-0">
              <p>เรื่องนี้อาจต้องให้เจ้าหน้าที่ตรวจสอบเพิ่มเติมค่ะ 😊 ต้องการให้ส่งเรื่องต่อไปยังทีม Support ไหมคะ?</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={confirmEscalate}
                  disabled={escalating}
                  className="rounded-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-[11px] font-semibold px-3 py-1.5 transition"
                >
                  {escalating ? "กำลังส่ง..." : "ส่งเรื่องต่อ"}
                </button>
                <button
                  type="button"
                  onClick={() => setSuggestEscalation(false)}
                  className="rounded-full border border-amber-300 text-amber-800 text-[11px] font-semibold px-3 py-1.5 transition"
                >
                  ไม่เป็นไร ลองต่อเอง
                </button>
              </div>
            </div>
          )}

          {messages.length === 0 && status !== "ESCALATED" && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5 shrink-0">
              {QUICK_ACTIONS.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => sendMessage(q.text)}
                  className="rounded-full border border-brand-200 hover:border-brand-400 text-brand-800 text-[11px] font-medium px-2.5 py-1 transition"
                >
                  {q.label}
                </button>
              ))}
            </div>
          )}

          <div className="p-3 border-t border-border shrink-0">
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !loading) sendMessage(input);
                }}
                disabled={status === "ESCALATED"}
                placeholder={status === "ESCALATED" ? "รอทีม Support ติดต่อกลับ..." : "พิมพ์ข้อความ..."}
                className="flex-1 rounded-full border border-border px-4 py-2 text-sm outline-none focus:border-brand-500 disabled:bg-brand-50/50"
              />
              <button
                type="button"
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim() || status === "ESCALATED"}
                className="rounded-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 transition shrink-0"
              >
                ส่ง
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-14 h-14 rounded-full bg-brand-600 hover:bg-brand-700 text-white shadow-xl flex items-center justify-center text-2xl transition"
        aria-label="เปิดแชท Support"
      >
        {open ? "×" : "💬"}
      </button>
    </div>
  );
}
