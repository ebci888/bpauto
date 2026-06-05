create table if not exists public.special_hours (
  id uuid primary key default gen_random_uuid(),
  special_date date not null unique,
  is_open boolean not null default false,
  opens_at time,
  closes_at time,
  slot_interval_minutes integer not null default 60 check (slot_interval_minutes in (30, 45, 60, 90, 120)),
  reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (is_open = false and opens_at is null and closes_at is null)
    or
    (is_open = true and opens_at is not null and closes_at is not null and opens_at < closes_at)
  )
);

create index if not exists special_hours_date_idx on public.special_hours(special_date);

drop trigger if exists set_special_hours_updated_at on public.special_hours;
create trigger set_special_hours_updated_at before update on public.special_hours
  for each row execute procedure public.set_updated_at();

alter table public.special_hours enable row level security;
