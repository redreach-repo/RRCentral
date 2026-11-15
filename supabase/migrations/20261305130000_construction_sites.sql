-- M12b construction pack: sites + workforce assignment stub.

create table if not exists public.construction_sites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  code text not null default '',
  name text not null,
  location text not null default '',
  status text not null default 'active'
    check (status in ('planned', 'active', 'on_hold', 'closed')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.site_workforce_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  site_id uuid not null references public.construction_sites (id) on delete cascade,
  employee_id uuid references public.hr_employees (id) on delete set null,
  role_label text not null default '',
  starts_on date,
  ends_on date,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists construction_sites_tenant_idx
  on public.construction_sites (tenant_id, status);
create index if not exists site_workforce_assignments_site_idx
  on public.site_workforce_assignments (site_id);

alter table public.construction_sites enable row level security;
alter table public.site_workforce_assignments enable row level security;
revoke all on public.construction_sites from anon, authenticated;
revoke all on public.site_workforce_assignments from anon, authenticated;
grant select, insert, update, delete on public.construction_sites to authenticated;
grant select, insert, update, delete on public.site_workforce_assignments to authenticated;

drop policy if exists "Members read construction_sites" on public.construction_sites;
create policy "Members read construction_sites" on public.construction_sites
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Staff write construction_sites" on public.construction_sites;
create policy "Staff write construction_sites" on public.construction_sites
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Tenant isolation" on public.construction_sites;
create policy "Tenant isolation" on public.construction_sites
  as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id))
  with check (public.rr_same_tenant(tenant_id));

drop policy if exists "Members read site_workforce_assignments" on public.site_workforce_assignments;
create policy "Members read site_workforce_assignments" on public.site_workforce_assignments
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Staff write site_workforce_assignments" on public.site_workforce_assignments;
create policy "Staff write site_workforce_assignments" on public.site_workforce_assignments
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_staff());

drop policy if exists "Tenant isolation" on public.site_workforce_assignments;
create policy "Tenant isolation" on public.site_workforce_assignments
  as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id))
  with check (public.rr_same_tenant(tenant_id));

comment on table public.construction_sites is 'M12b construction pack site stub.';
comment on table public.site_workforce_assignments is 'M12b site workforce assignment stub — not payroll.';
