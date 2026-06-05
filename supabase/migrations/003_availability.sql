create table if not exists public.shop_hours (
  id uuid primary key default gen_random_uuid(),
  day_of_week integer not null unique check (day_of_week between 0 and 6),
  is_open boolean not null default true,
  opens_at time,
  closes_at time,
  slot_interval_minutes integer not null default 60 check (slot_interval_minutes in (30, 45, 60, 90, 120)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (is_open = false and opens_at is null and closes_at is null)
    or
    (is_open = true and opens_at is not null and closes_at is not null and opens_at < closes_at)
  )
);

create table if not exists public.blocked_times (
  id uuid primary key default gen_random_uuid(),
  block_date date not null,
  start_time time not null,
  end_time time not null,
  reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time < end_time)
);

create index if not exists blocked_times_date_idx on public.blocked_times(block_date, start_time);

drop trigger if exists set_shop_hours_updated_at on public.shop_hours;
create trigger set_shop_hours_updated_at before update on public.shop_hours
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_blocked_times_updated_at on public.blocked_times;
create trigger set_blocked_times_updated_at before update on public.blocked_times
  for each row execute procedure public.set_updated_at();

alter table public.shop_hours enable row level security;
alter table public.blocked_times enable row level security;

insert into public.shop_hours (day_of_week, is_open, opens_at, closes_at, slot_interval_minutes)
values
  (0, false, null, null, 60),
  (1, true, '08:00', '18:00', 60),
  (2, true, '08:00', '18:00', 60),
  (3, true, '08:00', '18:00', 60),
  (4, true, '08:00', '18:00', 60),
  (5, true, '08:00', '18:00', 60),
  (6, true, '09:00', '16:00', 60)
on conflict (day_of_week) do nothing;
