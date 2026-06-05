create table if not exists public.ai_assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'public_site',
  status text not null default 'active' check (status in ('active', 'booking_ready', 'submitted', 'closed')),
  provider text not null default 'demo',
  latest_summary text,
  booking_draft jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_assistant_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  provider text,
  created_at timestamptz not null default now()
);

create index if not exists ai_assistant_messages_conversation_created_idx
  on public.ai_assistant_messages(conversation_id, created_at);

create index if not exists ai_assistant_conversations_status_created_idx
  on public.ai_assistant_conversations(status, created_at desc);

drop trigger if exists set_ai_assistant_conversations_updated_at on public.ai_assistant_conversations;
create trigger set_ai_assistant_conversations_updated_at before update on public.ai_assistant_conversations
for each row execute function public.set_updated_at();

alter table public.ai_assistant_conversations enable row level security;
alter table public.ai_assistant_messages enable row level security;
