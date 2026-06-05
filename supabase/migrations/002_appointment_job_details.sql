alter table public.appointments
  add column if not exists job_status text not null default 'scheduled',
  add column if not exists estimated_hours numeric(6, 2),
  add column if not exists actual_hours numeric(6, 2),
  add column if not exists billable_hours numeric(6, 2),
  add column if not exists internal_notes text;

alter table public.appointments
  drop constraint if exists appointments_job_status_check;

alter table public.appointments
  add constraint appointments_job_status_check
  check (job_status in ('scheduled', 'checked_in', 'in_progress', 'waiting_parts', 'paused', 'ready', 'completed'));

create index if not exists appointments_job_status_idx on public.appointments(job_status, appointment_date);
