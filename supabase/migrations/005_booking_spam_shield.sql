create table if not exists public.booking_submission_events (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid references public.booking_requests(id) on delete set null,
  ip_hash text,
  user_agent_hash text,
  email_hash text,
  phone_hash text,
  email_domain text,
  spam_status text not null default 'clean' check (spam_status in ('clean', 'suspected', 'blocked')),
  spam_score integer not null default 0,
  spam_reasons text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.booking_requests
  add column if not exists spam_status text not null default 'clean' check (spam_status in ('clean', 'suspected', 'blocked')),
  add column if not exists spam_score integer not null default 0,
  add column if not exists spam_reasons text[] not null default '{}',
  add column if not exists submitted_ip_hash text,
  add column if not exists turnstile_verified boolean not null default false;

create index if not exists booking_requests_spam_status_created_idx
  on public.booking_requests(spam_status, created_at desc);

create index if not exists booking_requests_clean_slot_idx
  on public.booking_requests(preferred_date, preferred_time)
  where status = 'requested' and spam_status = 'clean';

create index if not exists booking_submission_events_ip_created_idx
  on public.booking_submission_events(ip_hash, created_at desc)
  where ip_hash is not null;

create index if not exists booking_submission_events_email_created_idx
  on public.booking_submission_events(email_hash, created_at desc)
  where email_hash is not null;

create index if not exists booking_submission_events_phone_created_idx
  on public.booking_submission_events(phone_hash, created_at desc)
  where phone_hash is not null;

alter table public.booking_submission_events enable row level security;
