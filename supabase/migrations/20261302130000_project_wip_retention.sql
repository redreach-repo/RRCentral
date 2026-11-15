-- M9b deepen: WIP + retention fields on delivery projects (Unverified job-cost stub).

alter table public.delivery_projects
  add column if not exists retention_pct numeric(5, 2) not null default 0
    check (retention_pct >= 0 and retention_pct <= 100);

alter table public.delivery_projects
  add column if not exists billed_to_date_aed numeric(14, 2) not null default 0
    check (billed_to_date_aed >= 0);

alter table public.delivery_projects
  add column if not exists wip_aed numeric(14, 2) not null default 0;

comment on column public.delivery_projects.retention_pct is
  'Retention hold % of billed (Unverified — not full WIP accounting).';
comment on column public.delivery_projects.billed_to_date_aed is
  'Cumulative billed AED against the project.';
comment on column public.delivery_projects.wip_aed is
  'Manual / computed WIP AED stub (costs − billed + retention hold).';

create or replace function public.rr_project_refresh_wip(p_project uuid)
returns public.delivery_projects
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.delivery_projects;
  spent numeric;
  retention_hold numeric;
begin
  if not public.rr_is_staff() then
    raise exception 'Not allowed';
  end if;
  select * into p from public.delivery_projects where id = p_project for update;
  if not found then raise exception 'Project not found'; end if;
  if p.tenant_id is distinct from public.rr_my_tenant_id() then
    raise exception 'Wrong tenant';
  end if;

  select coalesce(sum(amount_aed), 0) into spent
  from public.project_cost_lines where project_id = p.id;

  retention_hold := round((coalesce(p.billed_to_date_aed, 0) * coalesce(p.retention_pct, 0) / 100.0)::numeric, 2);
  update public.delivery_projects
    set wip_aed = round((spent - coalesce(p.billed_to_date_aed, 0) + retention_hold)::numeric, 2),
        updated_at = now()
    where id = p.id
    returning * into p;
  return p;
end;
$$;

revoke all on function public.rr_project_refresh_wip(uuid) from public;
grant execute on function public.rr_project_refresh_wip(uuid) to authenticated;
