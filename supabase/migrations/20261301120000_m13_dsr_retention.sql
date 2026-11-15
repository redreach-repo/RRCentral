-- M13: DSR request log + admin retention prune wrappers.

create table if not exists public.dsr_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  request_type text not null check (request_type in ('access', 'erasure', 'export')),
  subject_email text not null default '',
  subject_name text not null default '',
  account_id uuid references public.accounts (id) on delete set null,
  status text not null default 'received'
    check (status in ('received', 'in_progress', 'completed', 'rejected')),
  detail text not null default '',
  requested_by uuid references public.app_users (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dsr_requests_tenant_idx
  on public.dsr_requests (tenant_id, status, created_at desc);

create table if not exists public.retention_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  ran_by uuid references public.app_users (id) on delete set null,
  app_errors_deleted int not null default 0,
  audit_deleted int not null default 0,
  detail text not null default '',
  created_at timestamptz not null default now()
);

-- Soft-delete helper columns (additive; RLS hide optional later).
alter table public.accounts add column if not exists deleted_at timestamptz;
alter table public.account_contacts add column if not exists deleted_at timestamptz;

create or replace function public.rr_retention_run(
  p_errors_keep interval default interval '90 days',
  p_audit_keep interval default interval '2 years'
)
returns public.retention_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  err_count int := 0;
  aud_count int := 0;
  row public.retention_runs;
begin
  if not public.rr_is_admin() then
    raise exception 'Admin only';
  end if;

  -- Prune helpers are revoke'd from authenticated; call via this wrapper.
  err_count := public.rr_app_errors_prune(p_errors_keep);
  aud_count := public.rr_audit_prune(p_audit_keep);

  insert into public.retention_runs (tenant_id, ran_by, app_errors_deleted, audit_deleted, detail)
  values (
    public.rr_my_tenant_id(),
    (select id from public.app_users where email = (auth.jwt() ->> 'email') limit 1),
    err_count,
    aud_count,
    'M13 retention prune'
  )
  returning * into row;

  return row;
end;
$$;

revoke all on function public.rr_retention_run(interval, interval) from public;
grant execute on function public.rr_retention_run(interval, interval) to authenticated;

-- Anonymize contact PII for erasure stub (keeps row for referential integrity).
create or replace function public.rr_dsr_anonymize_contact(p_contact uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.account_contacts;
begin
  if not public.rr_is_admin() then
    raise exception 'Admin only';
  end if;
  select * into c from public.account_contacts where id = p_contact for update;
  if not found then raise exception 'Contact not found'; end if;
  if c.deleted_at is not null then return; end if;
  update public.account_contacts
    set name = 'Redacted',
        email = '',
        phone = '',
        whatsapp = '',
        role = '',
        marketing_opt_in = false,
        marketing_opt_in_at = null,
        marketing_opt_in_source = 'dsr_erasure',
        deleted_at = now()
    where id = p_contact;
end;
$$;

revoke all on function public.rr_dsr_anonymize_contact(uuid) from public;
grant execute on function public.rr_dsr_anonymize_contact(uuid) to authenticated;

alter table public.dsr_requests enable row level security;
alter table public.retention_runs enable row level security;
revoke all on public.dsr_requests from anon, authenticated;
revoke all on public.retention_runs from anon, authenticated;
grant select, insert, update on public.dsr_requests to authenticated;
grant select on public.retention_runs to authenticated;

drop policy if exists "Admins manage dsr_requests" on public.dsr_requests;
create policy "Admins manage dsr_requests" on public.dsr_requests
  for all to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin())
  with check (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin());

drop policy if exists "Tenant isolation" on public.dsr_requests;
create policy "Tenant isolation" on public.dsr_requests
  as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id))
  with check (public.rr_same_tenant(tenant_id));

drop policy if exists "Admins read retention_runs" on public.retention_runs;
create policy "Admins read retention_runs" on public.retention_runs
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin());

drop policy if exists "Tenant isolation" on public.retention_runs;
create policy "Tenant isolation" on public.retention_runs
  as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id))
  with check (public.rr_same_tenant(tenant_id));

drop policy if exists "Staff full access" on public.dsr_requests;
drop policy if exists "Staff full access" on public.retention_runs;

comment on table public.dsr_requests is 'M13: data subject access/erasure/export request log.';
comment on function public.rr_retention_run(interval, interval) is 'M13: admin-triggered prune of app_errors + audit_log.';
