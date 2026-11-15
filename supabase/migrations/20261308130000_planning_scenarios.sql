-- M12 planning scenarios stub (what-if targets; not live forecasting).

create table if not exists public.planning_scenarios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  name text not null,
  description text not null default '',
  assumptions_json jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists planning_scenarios_tenant_idx
  on public.planning_scenarios (tenant_id, active);

alter table public.planning_scenarios enable row level security;
revoke all on public.planning_scenarios from anon, authenticated;
grant select, insert, update, delete on public.planning_scenarios to authenticated;

drop policy if exists "Members read planning_scenarios" on public.planning_scenarios;
create policy "Members read planning_scenarios" on public.planning_scenarios
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Staff write planning_scenarios" on public.planning_scenarios;
create policy "Staff write planning_scenarios" on public.planning_scenarios
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Tenant isolation" on public.planning_scenarios;
create policy "Tenant isolation" on public.planning_scenarios
  as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id))
  with check (public.rr_same_tenant(tenant_id));

drop policy if exists "Staff full access" on public.planning_scenarios;
drop policy if exists "Viewers read" on public.planning_scenarios;

comment on table public.planning_scenarios is
  'M12 scenario stubs — assumptions JSON only; live forecasting later.';
