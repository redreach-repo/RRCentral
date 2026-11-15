-- Maker-checker: expense status for Pending Approval.

alter table public.expenses
  add column if not exists status text not null default 'Recorded';

-- Normalize legacy blank → Recorded before tightening check.
update public.expenses set status = 'Recorded' where status is null or btrim(status) = '';

do $$
begin
  alter table public.expenses drop constraint if exists expenses_status_check;
exception when undefined_object then null;
end $$;

alter table public.expenses
  add constraint expenses_status_check
  check (status in ('Recorded', 'Pending Approval', 'Canceled'));

comment on column public.expenses.status is
  'Recorded | Pending Approval | Canceled — maker-checker sync.';
