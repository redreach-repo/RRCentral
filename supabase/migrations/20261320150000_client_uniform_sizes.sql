-- RR Threads (01): uniform sizes for our CLIENTS' staff, and when each item was issued.
--
-- These people are not Red Reach employees (they never go near HR / Payroll).
-- Each one belongs to a client from the company wide clients list.
--
-- * client_uniform_staff: one row per client staff member, with their sizes.
-- * client_uniform_issues: one row per uniform item handed to that person
--   (item, size, quantity, date issued).
--
-- Access (same as the clients list itself):
--   admin / manager / sales  read and write
--   viewer                   read only
--   staff                    no access (they cannot see the clients list either)
--   delete                   admin / manager only
-- Plus tenant isolation on both tables.
--
-- Safe to re-run.

------------------------------------------------------------
-- 1. Client staff and their sizes
------------------------------------------------------------
create table if not exists public.client_uniform_staff (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  client_id uuid not null references public.clients (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  employee_code text not null default '',
  department text not null default '',
  job_title text not null default '',
  shirt_size text not null default '',
  trouser_size text not null default '',
  jacket_size text not null default '',
  shoe_size text not null default '',
  cap_size text not null default '',
  other_sizes text not null default '',
  active boolean not null default true,
  notes text not null default '',
  created_by uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_uniform_staff_client_idx
  on public.client_uniform_staff (tenant_id, client_id, full_name);

-- One employee number per client (blank numbers are allowed many times).
create unique index if not exists client_uniform_staff_code_key
  on public.client_uniform_staff (tenant_id, client_id, lower(employee_code))
  where employee_code <> '';

comment on table public.client_uniform_staff is
  'RR Threads: staff of our clients (not Red Reach staff) and their uniform sizes.';

------------------------------------------------------------
-- 2. Uniform issue log
------------------------------------------------------------
create table if not exists public.client_uniform_issues (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  staff_id uuid not null references public.client_uniform_staff (id) on delete cascade,
  item text not null check (length(trim(item)) > 0),
  size text not null default '',
  quantity integer not null default 1 check (quantity > 0),
  issued_on date not null default current_date,
  notes text not null default '',
  created_by uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists client_uniform_issues_staff_idx
  on public.client_uniform_issues (staff_id, issued_on desc);
create index if not exists client_uniform_issues_tenant_idx
  on public.client_uniform_issues (tenant_id, issued_on desc);

comment on table public.client_uniform_issues is
  'RR Threads: each uniform item issued to a client staff member, with size, quantity and date.';

-- An issue row always sits in the same tenant as the person it was issued to.
create or replace function public.rr_uniform_issue_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select s.tenant_id into new.tenant_id
  from public.client_uniform_staff s
  where s.id = new.staff_id;
  return new;
end $$;

revoke all on function public.rr_uniform_issue_tenant() from public;

drop trigger if exists rr_uniform_issue_tenant on public.client_uniform_issues;
create trigger rr_uniform_issue_tenant before insert or update of staff_id on public.client_uniform_issues
  for each row execute function public.rr_uniform_issue_tenant();

------------------------------------------------------------
-- 3. Row level security
------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['client_uniform_staff', 'client_uniform_issues'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);

    -- Older catch-up scripts add a blanket policy to every table; it would let
    -- sales delete, so remove it here.
    execute format('drop policy if exists "Staff full access" on public.%I', t);
    execute format('drop policy if exists "Authenticated users full access" on public.%I', t);

    execute format('drop policy if exists "Staff read" on public.%I', t);
    execute format(
      'create policy "Staff read" on public.%I for select to authenticated
         using (public.rr_is_staff())', t);

    execute format('drop policy if exists "Viewers read" on public.%I', t);
    execute format(
      'create policy "Viewers read" on public.%I for select to authenticated
         using (public.rr_current_role() = ''viewer'')', t);

    execute format('drop policy if exists "Staff insert" on public.%I', t);
    execute format(
      'create policy "Staff insert" on public.%I for insert to authenticated
         with check (public.rr_is_staff())', t);

    execute format('drop policy if exists "Staff update" on public.%I', t);
    execute format(
      'create policy "Staff update" on public.%I for update to authenticated
         using (public.rr_is_staff()) with check (public.rr_is_staff())', t);

    execute format('drop policy if exists "Managers delete" on public.%I', t);
    execute format(
      'create policy "Managers delete" on public.%I for delete to authenticated
         using (public.rr_is_manager_or_admin())', t);

    execute format('drop policy if exists "Tenant isolation" on public.%I', t);
    execute format(
      'create policy "Tenant isolation" on public.%I as restrictive for all to authenticated
         using (public.rr_same_tenant(tenant_id)) with check (public.rr_same_tenant(tenant_id))', t);

    -- Audit trail, when the audit helper is installed.
    if exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'rr_audit_trigger'
    ) then
      execute format('drop trigger if exists rr_audit on public.%I', t);
      execute format(
        'create trigger rr_audit after insert or update or delete on public.%I
           for each row execute function public.rr_audit_trigger()', t);
    end if;
  end loop;
end $$;
