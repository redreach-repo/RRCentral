-- M12b: HR attendance day stub (not labour-law / WPS attendance).

create table if not exists public.hr_attendance_days (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  employee_id uuid not null references public.hr_employees (id) on delete cascade,
  work_date date not null,
  status text not null default 'present'
    check (status in ('present', 'absent', 'half', 'leave', 'holiday')),
  hours numeric(6, 2) not null default 8 check (hours >= 0 and hours <= 24),
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (tenant_id, employee_id, work_date)
);

create index if not exists hr_attendance_days_tenant_idx
  on public.hr_attendance_days (tenant_id, work_date desc);
create index if not exists hr_attendance_days_employee_idx
  on public.hr_attendance_days (employee_id, work_date desc);

alter table public.hr_attendance_days enable row level security;
revoke all on public.hr_attendance_days from anon, authenticated;
grant select, insert, update, delete on public.hr_attendance_days to authenticated;

drop policy if exists "Members read hr_attendance_days" on public.hr_attendance_days;
create policy "Members read hr_attendance_days" on public.hr_attendance_days
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Staff write hr_attendance_days" on public.hr_attendance_days;
create policy "Staff write hr_attendance_days" on public.hr_attendance_days
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Tenant isolation" on public.hr_attendance_days;
create policy "Tenant isolation" on public.hr_attendance_days
  as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id))
  with check (public.rr_same_tenant(tenant_id));

comment on table public.hr_attendance_days is
  'M12b attendance stub — not certified WPS / labour attendance.';
