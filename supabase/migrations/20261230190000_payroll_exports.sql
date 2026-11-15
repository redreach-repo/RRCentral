-- M8 deepen: audit log when a payroll WPS/CSV/SIF draft is exported.

create table if not exists public.payroll_exports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  run_id uuid not null references public.payroll_runs (id) on delete cascade,
  export_kind text not null check (export_kind in ('wps_csv', 'wps_sif')),
  line_count int not null default 0,
  employer_id_masked text not null default '',
  exported_by uuid references public.app_users (id) on delete set null,
  exported_at timestamptz not null default now(),
  notes text not null default 'Draft export — not bank-certified'
);

create index if not exists payroll_exports_run_idx
  on public.payroll_exports (run_id, exported_at desc);

alter table public.payroll_exports enable row level security;
revoke all on public.payroll_exports from anon, authenticated;
grant select, insert on public.payroll_exports to authenticated;

drop policy if exists "Managers read payroll_exports" on public.payroll_exports;
create policy "Managers read payroll_exports" on public.payroll_exports
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_manager_or_admin());

drop policy if exists "Managers insert payroll_exports" on public.payroll_exports;
create policy "Managers insert payroll_exports" on public.payroll_exports
  for insert to authenticated
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_manager_or_admin());

drop policy if exists "Tenant isolation" on public.payroll_exports;
create policy "Tenant isolation" on public.payroll_exports
  as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id))
  with check (public.rr_same_tenant(tenant_id));

drop policy if exists "Staff full access" on public.payroll_exports;
drop policy if exists "Viewers read" on public.payroll_exports;

comment on table public.payroll_exports is 'M8: draft WPS/CSV export audit (not a live bank submission log).';
