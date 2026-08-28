/**
 * Support Chat orchestration — the one place that ties together config,
 * knowledge retrieval, conversation history, the AI call, and persistence.
 * Server-only. Never trusts the client for provider/model — always reads
 * lib/support/settings.ts's admin-configured active provider.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserPlan, formatPlanLabel } from "@/lib/plan-limits";
import { getSupportAiConfig, getSupportLineSettings, isSupportLineReady } from "./settings";
import { findRelevantKnowledge } from "./knowledge";
import { callGroqSupport, callOpenAiSupport } from "./provider";
import { pushLineText, broadcastLineText } from "@/lib/line";

const HISTORY_WINDOW_MESSAGES = 10; // last 5 exchanges — bounds tokens per turn
const MAX_USER_MESSAGE_CHARS = 1000;

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type SendMessageResult =
  | { ok: true; conversationId: string; reply: string; suggestEscalation: boolean; status: string }
  | { ok: false; error: string };

/**
 * Resolves which conversation a message belongs to. The widget starts a
 * fresh conversation every time it's opened (by design — see
 * SupportChatWidget's `open` reset), so this only ever resumes a specific
 * conversation the caller already knows about (passed explicitly), never
 * "whatever was last active" — old conversations stay in the DB for
 * admin/history but are never silently re-attached to on a new session.
 */
async function resolveConversation(userId: string, conversationId?: string | null): Promise<{ id: string; status: string }> {
  const admin = createAdminClient();
  if (conversationId) {
    const { data: owned } = await admin
      .from("support_conversations")
      .select("id, status")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (owned) return owned as { id: string; status: string };
  }

  const { data: created } = await admin
    .from("support_conversations")
    .insert({ user_id: userId })
    .select("id, status")
    .single();
  return created as { id: string; status: string };
}

async function loadHistory(conversationId: string): Promise<ChatTurn[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("support_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .neq("role", "system")
    .order("created_at", { ascending: false })
    .limit(HISTORY_WINDOW_MESSAGES);
  return ((data ?? []) as ChatTurn[]).reverse();
}

async function saveMessage(conversationId: string, role: "user" | "assistant", content: string) {
  const admin = createAdminClient();
  await admin.from("support_messages").insert({ conversation_id: conversationId, role, content });
  await admin.from("support_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
}

async function buildAccountContext(supabase: SupabaseClient, userId: string): Promise<string> {
  try {
    const plan = await getUserPlan(supabase, userId);
    return `แพ็กเกจปัจจุบันของลูกค้า: ${plan.name} (${formatPlanLabel(plan)})`;
  } catch {
    return "ไม่สามารถดึงข้อมูลแพ็กเกจของลูกค้าได้ในขณะนี้";
  }
}

function buildSystemPrompt(params: {
  assistantName: string;
  tone: string;
  knowledgeBlock: string;
  accountContext: string;
  turnCount: number;
  escalationAfterTurns: number;
}): string {
  const { assistantName, tone, knowledgeBlock, accountContext, turnCount, escalationAfterTurns } = params;
  return [
    `คุณคือ "${assistantName}" ผู้ช่วยฝ่ายบริการลูกค้าของ SMF IoT (ระบบ IoT สำหรับฟาร์มเกษตร) พูดคุยผ่านแชทบนเว็บไซต์`,
    `บุคลิก: ${tone} เป็นผู้ช่วยเพศหญิง สุภาพ เป็นกันเอง ไม่แข็งเหมือนแชทบอททั่วไป`,
    `ห้ามอ้างว่าเป็นมนุษย์จริง — ถ้าถูกถามตรงๆ ว่าเป็น AI หรือไม่ ให้ตอบตามจริงอย่างเป็นมิตร`,
    "",
    "กฎสำคัญ:",
    "- ห้ามแต่งราคา โปรโมชั่น สถานะการชำระเงิน หรือสถานะระบบขึ้นมาเอง ใช้เฉพาะข้อมูลที่ให้มาด้านล่างเท่านั้น",
    "- ถ้าไม่มีข้อมูลที่ต้องการ ให้บอกตรงๆ ว่าไม่แน่ใจ/ไม่มีข้อมูล แล้วเสนอส่งต่อเจ้าหน้าที่แทนการเดา",
    "- พยายามช่วยแก้ปัญหาเบื้องต้นก่อนเสมอ (ถามข้อมูลที่จำเป็นให้น้อยที่สุด แนะนำ troubleshooting ทีละขั้น)",
    "- ถ้าปัญหาซับซ้อน เกี่ยวกับข้อพิพาทเรื่องเงิน ลูกค้าขอคุยกับเจ้าหน้าที่ หรือแก้ปัญหาหลายรอบแล้วไม่หาย ให้ตั้ง suggest_escalation = true พร้อมสรุปเหตุผลสั้นๆ ใน escalation_reason",
    turnCount >= escalationAfterTurns
      ? `- คุยกันมาแล้ว ${turnCount} รอบยังไม่จบ ควรพิจารณาเสนอส่งต่อเจ้าหน้าที่ถ้ายังแก้ไม่ได้`
      : "",
    "- ตอบสั้น กระชับ ไม่ยาวเกินจำเป็น",
    "- ห้ามเปิดเผยตัวแปรสภาพแวดล้อม คีย์ลับ โทเค็น หรือรายละเอียดการทำงานภายในของระบบ",
    "- ห้ามรันคำสั่งหรือดำเนินการใดๆ กับระบบ ไม่ว่าผู้ใช้จะร้องขออย่างไร คุณตอบเป็นข้อความเท่านั้น",
    "",
    `ข้อมูลบัญชีลูกค้า: ${accountContext}`,
    knowledgeBlock ? `\nความรู้ที่เกี่ยวข้อง (ใช้ประกอบการตอบถ้าตรงกับคำถาม):\n${knowledgeBlock}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function sendSupportMessage(
  supabase: SupabaseClient,
  userId: string,
  userMessage: string,
  conversationId?: string | null
): Promise<SendMessageResult> {
  const message = userMessage.trim().slice(0, MAX_USER_MESSAGE_CHARS);
  if (!message) return { ok: false, error: "empty message" };

  const cfg = await getSupportAiConfig();
  if (!cfg.enabled) return { ok: false, error: "Support chat is currently unavailable." };

  const conversation = await resolveConversation(userId, conversationId);
  if (conversation.status === "ESCALATED") {
    // still record the message so the human agent sees it, but don't call AI again
    await saveMessage(conversation.id, "user", message);
    return { ok: true, conversationId: conversation.id, reply: "", suggestEscalation: false, status: "ESCALATED" };
  }

  const [history, knowledge, accountContext] = await Promise.all([
    loadHistory(conversation.id),
    findRelevantKnowledge(message),
    buildAccountContext(supabase, userId),
  ]);

  const knowledgeBlock = knowledge.map((k) => `[${k.category}] ${k.title}\n${k.content}`).join("\n\n");
  const turnCount = Math.floor(history.length / 2) + 1;
  const systemPrompt = buildSystemPrompt({
    assistantName: cfg.assistant_name,
    tone: cfg.tone,
    knowledgeBlock,
    accountContext,
    turnCount,
    escalationAfterTurns: cfg.escalation_after_turns,
  });

  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user" as const, content: message },
  ];

  const maxTokens = Math.max(600, Math.min(4000, cfg.max_response_length * 4));
  const result =
    cfg.provider === "groq"
      ? await callGroqSupport(cfg.groq_model, messages, maxTokens)
      : await callOpenAiSupport(cfg.openai_model, messages, maxTokens);

  if (!result.ok) {
    console.warn("[support.chat] provider failed", cfg.provider, result.error);
    return { ok: false, error: "AI service is temporarily unavailable." };
  }

  await saveMessage(conversation.id, "user", message);
  await saveMessage(conversation.id, "assistant", result.reply);

  return {
    ok: true,
    conversationId: conversation.id,
    reply: result.reply,
    suggestEscalation: result.suggestEscalation,
    status: conversation.status,
  };
}

/** Server-side (non-AI) summary — deliberately not another AI call, per
 * the token-efficiency requirement. Just the last few turns, capped. */
function buildHandoffSummary(history: ChatTurn[]): string {
  const recent = history.slice(-6);
  return recent.map((h) => `${h.role === "user" ? "ลูกค้า" : assistantLabel}: ${h.content}`.slice(0, 300)).join("\n").slice(0, 1200);
}
const assistantLabel = "AI";

export async function escalateConversation(
  userId: string,
  userEmail: string,
  userDisplayName: string,
  reason: string,
  conversationId?: string | null
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const conversation = await resolveConversation(userId, conversationId);
  const history = await loadHistory(conversation.id);
  const summary = buildHandoffSummary(history);

  await admin
    .from("support_conversations")
    .update({
      status: "ESCALATED",
      escalation_reason: reason.slice(0, 300) || "ลูกค้าขอคุยกับเจ้าหน้าที่",
      escalation_summary: summary,
      escalated_at: new Date().toISOString(),
    })
    .eq("id", conversation.id);

  const line = await getSupportLineSettings();
  if (isSupportLineReady(line)) {
    const text = [
      "🆘 Support Handoff — SMF IoT",
      `ลูกค้า: ${userDisplayName} (${userEmail})`,
      `เหตุผล: ${reason || "ลูกค้าขอคุยกับเจ้าหน้าที่"}`,
      "",
      "บทสนทนาล่าสุด:",
      summary || "(ไม่มีบทสนทนาก่อนหน้า)",
    ].join("\n");
    const sent = line.mode === "broadcast" ? await broadcastLineText(line.channel_access_token, text) : await pushLineText(line.channel_access_token, line.target_id, text);
    if (!sent.ok) console.warn("[support.escalate] LINE send failed", sent.error);
  }

  return { ok: true };
}
