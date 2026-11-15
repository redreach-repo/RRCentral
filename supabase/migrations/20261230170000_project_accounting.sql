-- M9b: light project accounting — projects + cost lines against accounts.

create table if not exists public.delivery_projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  account_id uuid references public.accounts (id) on delete set null,
  code text not null default '',
  name text not null,
  status text not null default 'active'
    check (status in ('planned', 'active', 'on_hold', 'done', 'canceled')),
  starts_on date,
  ends_on date,
  budget_aed numeric(14, 2),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists delivery_projects_tenant_code_uidx
  on public.delivery_projects (tenant_id, code)
  where code <> '';

create index if not exists delivery_projects_tenant_idx
  on public.delivery_projects (tenant_id, status);

create table if not exists public.project_cost_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  project_id uuid not null references public.delivery_projects (id) on delete cascade,
  cost_date date not null default current_date,
  category text not null default 'other'
    check (category in ('labour', 'materials', 'subcontractor', 'expense', 'other')),
  description text not null default '',
  amount_aed numeric(14, 2) not null default 0,
  created_by uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists project_cost_lines_project_idx
  on public.project_cost_lines (project_id, cost_date desc);

alter table public.delivery_projects enable row level security;
alter table public.project_cost_lines enable row level security;
revoke all on public.delivery_projects from anon, authenticated;
revoke all on public.project_cost_lines from anon, authenticated;
grant select, insert, update, delete on public.delivery_projects to authenticated;
grant select, insert, update, delete on public.project_cost_lines to authenticated;

do $$
declare t text;
begin
  foreach t in array array['delivery_projects', 'project_cost_lines']
  loop
    execute format('drop policy if exists %I on public.%I', 'Members read ' || t, t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff())',
      'Members read ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'Staff write ' || t, t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff())
         with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff())',
      'Staff write ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'Tenant isolation', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using (public.rr_same_tenant(tenant_id))
         with check (public.rr_same_tenant(tenant_id))',
      'Tenant isolation', t);
    execute format('drop policy if exists %I on public.%I', 'Staff full access', t);
    execute format('drop policy if exists %I on public.%I', 'Viewers read', t);
  end loop;
end $$;

comment on table public.delivery_projects is 'M9b: delivery/project accounting headers.';
comment on table public.project_cost_lines is 'M9b: cost lines against a project (labour/materials/…).';
