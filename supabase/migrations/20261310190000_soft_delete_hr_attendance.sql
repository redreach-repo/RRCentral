-- Soft-delete: HR attendance days.

alter table public.hr_attendance_days add column if not exists deleted_at timestamptz;

create index if not exists hr_attendance_days_deleted_at_idx on public.hr_attendance_days (deleted_at);

comment on column public.hr_attendance_days.deleted_at is 'M13 soft-delete; null = active.';
