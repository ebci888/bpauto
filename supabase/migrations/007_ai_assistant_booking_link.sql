alter table public.ai_assistant_conversations
  add column if not exists booking_request_id uuid references public.booking_requests(id) on delete set null;

create index if not exists ai_assistant_conversations_booking_request_idx
  on public.ai_assistant_conversations(booking_request_id);
