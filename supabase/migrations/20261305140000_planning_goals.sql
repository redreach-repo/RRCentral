-- §6.12 planning goals stub (scenarios later).

create table if not exists public.planning_goals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  name text not null,
  metric_key text not null default 'revenue_aed',
  target_value numeric(14, 2) not null default 0,
  period_yyyy_mm text not null default '',
  status text not null default 'active'
    check (status in ('active', 'achieved', 'missed', 'canceled')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists planning_goals_tenant_idx
  on public.planning_goals (tenant_id, period_yyyy_mm, status);

alter table public.planning_goals enable row level security;
revoke all on public.planning_goals from anon, authenticated;
grant select, insert, update, delete on public.planning_goals to authenticated;

drop policy if exists "Members read planning_goals" on public.planning_goals;
create policy "Members read planning_goals" on public.planning_goals
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Staff write planning_goals" on public.planning_goals;
create policy "Staff write planning_goals" on public.planning_goals
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Tenant isolation" on public.planning_goals;
create policy "Tenant isolation" on public.planning_goals
  as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id))
  with check (public.rr_same_tenant(tenant_id));

comment on table public.planning_goals is 'M12 planning goals stub — scenarios builder later.';
