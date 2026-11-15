-- M9b deepen: project billing schedule milestones.

create table if not exists public.project_billing_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  project_id uuid not null references public.delivery_projects (id) on delete cascade,
  milestone_label text not null default '',
  pct numeric(5, 2) not null default 0 check (pct >= 0 and pct <= 100),
  amount_aed numeric(14, 2) not null default 0 check (amount_aed >= 0),
  due_on date,
  status text not null default 'planned'
    check (status in ('planned', 'billed', 'paid', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_billing_schedules_project_idx
  on public.project_billing_schedules (project_id, due_on);

alter table public.project_billing_schedules enable row level security;
revoke all on public.project_billing_schedules from anon, authenticated;
grant select, insert, update, delete on public.project_billing_schedules to authenticated;

drop policy if exists "Members read project_billing_schedules" on public.project_billing_schedules;
create policy "Members read project_billing_schedules" on public.project_billing_schedules
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Staff write project_billing_schedules" on public.project_billing_schedules;
create policy "Staff write project_billing_schedules" on public.project_billing_schedules
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Tenant isolation" on public.project_billing_schedules;
create policy "Tenant isolation" on public.project_billing_schedules
  as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id))
  with check (public.rr_same_tenant(tenant_id));

drop policy if exists "Staff full access" on public.project_billing_schedules;
drop policy if exists "Viewers read" on public.project_billing_schedules;

-- Mark milestone billed and bump project billed_to_date + WIP.
create or replace function public.rr_project_mark_milestone_billed(p_schedule uuid)
returns public.project_billing_schedules
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.project_billing_schedules;
  p public.delivery_projects;
begin
  if not public.rr_is_staff() then
    raise exception 'Not allowed';
  end if;
  select * into s from public.project_billing_schedules where id = p_schedule for update;
  if not found then raise exception 'Schedule not found'; end if;
  if s.tenant_id is distinct from public.rr_my_tenant_id() then
    raise exception 'Wrong tenant';
  end if;
  if s.status = 'billed' or s.status = 'paid' then
    return s;
  end if;

  update public.project_billing_schedules
    set status = 'billed', updated_at = now()
    where id = s.id
    returning * into s;

  update public.delivery_projects
    set billed_to_date_aed = coalesce(billed_to_date_aed, 0) + coalesce(s.amount_aed, 0),
        updated_at = now()
    where id = s.project_id;

  perform public.rr_project_refresh_wip(s.project_id);
  return s;
end;
$$;

revoke all on function public.rr_project_mark_milestone_billed(uuid) from public;
grant execute on function public.rr_project_mark_milestone_billed(uuid) to authenticated;

comment on table public.project_billing_schedules is 'M9b: planned billing milestones against a delivery project.';
