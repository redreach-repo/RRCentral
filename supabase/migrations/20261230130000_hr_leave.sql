-- M6 deepen: leave requests for HR employees.
-- Additive. Manager/admin approve; employee row must be same tenant.

create table if not exists public.hr_leave_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  employee_id uuid not null references public.hr_employees (id) on delete cascade,
  leave_type text not null default 'annual'
    check (leave_type in ('annual', 'sick', 'unpaid', 'other')),
  starts_on date not null,
  ends_on date not null,
  days numeric(6, 2) not null default 1 check (days > 0),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'canceled')),
  reason text not null default '',
  decision_note text not null default '',
  requested_by uuid references public.app_users (id) on delete set null,
  decided_by uuid references public.app_users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_leave_dates check (ends_on >= starts_on)
);

create index if not exists hr_leave_requests_tenant_idx
  on public.hr_leave_requests (tenant_id, status, starts_on desc);
create index if not exists hr_leave_requests_employee_idx
  on public.hr_leave_requests (employee_id, starts_on desc);

create or replace function public.rr_hr_leave_decide(
  p_id uuid,
  p_decision text,
  p_note text default ''
)
returns public.hr_leave_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.hr_leave_requests;
  next_status text;
begin
  if p_decision not in ('approve', 'reject', 'cancel') then
    raise exception 'Invalid leave decision';
  end if;
  if not public.rr_is_manager_or_admin() and p_decision <> 'cancel' then
    raise exception 'Only managers or admins can approve or reject leave';
  end if;

  select * into r from public.hr_leave_requests where id = p_id for update;
  if not found then
    raise exception 'Leave request not found';
  end if;
  if r.tenant_id is distinct from public.rr_my_tenant_id() then
    raise exception 'Wrong tenant';
  end if;
  if r.status <> 'pending' then
    raise exception 'Only pending leave can be decided';
  end if;

  next_status := case p_decision
    when 'approve' then 'approved'
    when 'reject' then 'rejected'
    else 'canceled'
  end;

  update public.hr_leave_requests
    set status = next_status,
        decision_note = left(coalesce(p_note, ''), 1000),
        decided_by = public.rr_current_user_id(),
        decided_at = now(),
        updated_at = now()
    where id = p_id
    returning * into r;
  return r;
end;
$$;

revoke all on function public.rr_hr_leave_decide(uuid, text, text) from public;
grant execute on function public.rr_hr_leave_decide(uuid, text, text) to authenticated;

alter table public.hr_leave_requests enable row level security;
revoke all on public.hr_leave_requests from anon, authenticated;
grant select, insert, update, delete on public.hr_leave_requests to authenticated;

drop policy if exists "Managers read hr_leave_requests" on public.hr_leave_requests;
create policy "Managers read hr_leave_requests" on public.hr_leave_requests
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_manager_or_admin());

drop policy if exists "Managers write hr_leave_requests" on public.hr_leave_requests;
create policy "Managers write hr_leave_requests" on public.hr_leave_requests
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_manager_or_admin())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_manager_or_admin());

drop policy if exists "Tenant isolation" on public.hr_leave_requests;
create policy "Tenant isolation" on public.hr_leave_requests
  as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id))
  with check (public.rr_same_tenant(tenant_id));

drop policy if exists "Staff full access" on public.hr_leave_requests;
drop policy if exists "Viewers read" on public.hr_leave_requests;

comment on table public.hr_leave_requests is 'M6 deepen: leave requests (annual/sick/unpaid/other).';
