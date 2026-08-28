-- Phase 6.17 — AI Customer Support Chat.
--
-- Reuses: system_settings (support_ai + support_line config, same
-- key/value/upsert pattern as the existing "ai" and "line" rows — API
-- keys stay in env vars, never touch this table), profiles (user_id fk),
-- lib/line.ts's pushLineText() for the human-handoff notification (no new
-- LINE plumbing — just a second admin-configurable destination separate
-- from the customer-facing broadcast channel).
--
-- New tables only for what didn't already exist: support_conversations
-- (one row per chat session, holds escalation state directly rather than
-- a separate escalations table — this scope is "AI Support + LINE
-- escalation", not a full helpdesk), support_messages (turn-by-turn),
-- support_knowledge_base (admin-managed KB articles used for retrieval).

create table if not exists support_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'AI_ACTIVE' check (status in ('AI_ACTIVE', 'ESCALATED', 'CLOSED')),
  escalation_reason text,
  escalation_summary text,
  escalated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_conversations_user_idx on support_conversations (user_id, updated_at desc);

alter table support_conversations enable row level security;
drop policy if exists support_conversations_owner_select on support_conversations;
create policy support_conversations_owner_select on support_conversations for select using (user_id = auth.uid());
-- no insert/update/delete policy — only the service-role client (API routes) writes here,
-- same as ai_requests (Phase 6.14).

create table if not exists support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references support_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists support_messages_conversation_idx on support_messages (conversation_id, created_at);

alter table support_messages enable row level security;
drop policy if exists support_messages_owner_select on support_messages;
create policy support_messages_owner_select on support_messages for select using (
  conversation_id in (select id from support_conversations where user_id = auth.uid())
);
-- no insert/update/delete policy — service-role only, same reasoning as above.

create table if not exists support_knowledge_base (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  content text not null,
  status text not null default 'draft' check (status in ('published', 'draft')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_knowledge_base_status_idx on support_knowledge_base (status);

-- RLS enabled, no policies — only the service-role client (admin CRUD +
-- the support chat API's retrieval) ever reads/writes this table.
alter table support_knowledge_base enable row level security;

select 'support_conversations' as t, count(*) from support_conversations
union all select 'support_messages', count(*) from support_messages
union all select 'support_knowledge_base', count(*) from support_knowledge_base;
