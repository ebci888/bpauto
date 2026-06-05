create extension if not exists pgcrypto;

do $$ begin
  create type staff_role as enum ('owner', 'mechanic', 'staff');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type booking_status as enum ('requested', 'confirmed', 'cancelled', 'completed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type queue_source as enum ('website_booking', 'dashboard_quick_capture');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type notification_status as enum ('pending', 'sent', 'failed', 'skipped');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role staff_role not null default 'staff',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text,
  normalized_phone text,
  email text,
  is_temporary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists customers_normalized_phone_unique
  on public.customers(normalized_phone)
  where normalized_phone is not null and normalized_phone <> '';

create index if not exists customers_email_idx on public.customers(lower(email));

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  description text,
  license_plate text,
  vin text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vehicles_vin_unique
  on public.vehicles(vin)
  where vin is not null and vin <> '';

create index if not exists vehicles_customer_id_idx on public.vehicles(customer_id);
create index if not exists vehicles_license_plate_idx on public.vehicles(license_plate);

create table if not exists public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  status booking_status not null default 'requested',
  customer_id uuid references public.customers(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  customer_name text not null,
  phone text not null,
  normalized_phone text not null,
  email text not null,
  vehicle_description text not null,
  service_needed text not null,
  preferred_date date not null,
  preferred_time text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists booking_requests_status_created_idx on public.booking_requests(status, created_at desc);
create index if not exists booking_requests_customer_id_idx on public.booking_requests(customer_id);

create table if not exists public.queue_items (
  id uuid primary key default gen_random_uuid(),
  source queue_source not null,
  booking_request_id uuid references public.booking_requests(id) on delete set null,
  queue_date date not null default current_date,
  quick_note text not null,
  customer_id uuid references public.customers(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  customer_name text,
  phone text,
  normalized_phone text,
  email text,
  vehicle_description text,
  license_plate text,
  vin text,
  service_needed text,
  waiting_status text not null default '',
  priority text not null default '',
  payment_status text,
  follow_up_scheduled boolean not null default false,
  missing_fields text[] not null default '{}',
  is_incomplete boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists queue_items_queue_date_idx on public.queue_items(queue_date, created_at desc);
create index if not exists queue_items_incomplete_idx on public.queue_items(is_incomplete, created_at desc);
create index if not exists queue_items_booking_request_id_idx on public.queue_items(booking_request_id);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid references public.booking_requests(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  appointment_date date not null,
  appointment_time text not null,
  status booking_status not null default 'confirmed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists appointments_unique_confirmed_slot
  on public.appointments(appointment_date, appointment_time)
  where status = 'confirmed';

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  booking_request_id uuid references public.booking_requests(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  channel text not null,
  event_type text not null,
  recipient text not null,
  subject text,
  body text not null,
  status notification_status not null default 'pending',
  provider text,
  provider_message_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notification_events_booking_request_id_idx on public.notification_events(booking_request_id);
create index if not exists notification_events_status_idx on public.notification_events(status, created_at desc);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_entity_idx on public.audit_events(entity_type, entity_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_customers_updated_at on public.customers;
create trigger set_customers_updated_at before update on public.customers
for each row execute function public.set_updated_at();

drop trigger if exists set_vehicles_updated_at on public.vehicles;
create trigger set_vehicles_updated_at before update on public.vehicles
for each row execute function public.set_updated_at();

drop trigger if exists set_booking_requests_updated_at on public.booking_requests;
create trigger set_booking_requests_updated_at before update on public.booking_requests
for each row execute function public.set_updated_at();

drop trigger if exists set_queue_items_updated_at on public.queue_items;
create trigger set_queue_items_updated_at before update on public.queue_items
for each row execute function public.set_updated_at();

drop trigger if exists set_appointments_updated_at on public.appointments;
create trigger set_appointments_updated_at before update on public.appointments
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
alter table public.booking_requests enable row level security;
alter table public.queue_items enable row level security;
alter table public.appointments enable row level security;
alter table public.notification_events enable row level security;
alter table public.audit_events enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), 'staff')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self"
on public.profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());
