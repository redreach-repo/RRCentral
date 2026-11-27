-- Sales lockdown, PR 1: the database lock.
--
-- Sales users only reach their own clients, and nothing of the company's money.
--   * "Their" client = an account they own, a lead (crm) they own, or a client
--     row they added. Quotes, invoices, delivery notes, Client POs and their
--     lines count as theirs when they made them or when they belong to one of
--     their clients (an invoice made from their quote keeps the quote's ref).
--   * Projects (delivery_projects): only the ones they are added to, through the
--     new delivery_project_members table, or on an account they own.
--   * Money tables (expenses, vendors, supplier side, purchase orders, project
--     costs, chasing, refunds, ...) are closed to Sales.
--   * income / payment_log / customer_payments: only the rows of their own
--     invoices (the invoice screen keeps income in step with the invoice).
--   * Per-person switches in public.user_permissions open more:
--       clients.view_all  read every client, lead and account (no editing)
--       finance.company   everything a Sales user could reach before this file
--       quotes.margin, export.csv, ai.connector  (used by the screens, PR 2/3)
--
-- How: RESTRICTIVE policies, ANDed with the existing permissive ones, that
-- only bite when rr_current_role() = 'sales'. Admin, manager, staff and viewer
-- behave exactly as before. Safe to re-run: every object is create-or-replace
-- or dropped first. Needs 20261023090000_accounts_foundation.sql and
-- 20261213120000_platform_tenancy.sql.

------------------------------------------------------------
-- 0. Earlier SQL this file needs (a clear message instead of a half run)
------------------------------------------------------------
do $$
declare
  missing text;
begin
  select string_agg(need, ', ') into missing
  from (values
    ('accounts.owner_user_id'), ('accounts.deleted_at'), ('crm.deleted_at'), ('clients.account_id'),
    ('quotations.account_id'), ('invoices.account_id'), ('delivery_notes.client_po_id'),
    ('delivery_notes.invoice_ref'), ('client_purchase_orders.client_id'),
    ('client_purchase_orders.quote_reference'), ('delivery_projects.account_id')
  ) v(need)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = split_part(need, '.', 1)
      and c.column_name = split_part(need, '.', 2)
  );
  if missing is not null then
    raise exception 'Sales lockdown needs earlier SQL first. Missing: %', missing;
  end if;
end $$;

------------------------------------------------------------
-- 1. Per-person switches
------------------------------------------------------------
create table if not exists public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  user_id uuid not null references public.app_users (id) on delete cascade,
  permission text not null,
  granted_by text not null default '',
  granted_at timestamptz not null default now(),
  unique (user_id, permission)
);

alter table public.user_permissions drop constraint if exists user_permissions_permission_check;
alter table public.user_permissions
  add constraint user_permissions_permission_check
  check (permission in ('clients.view_all', 'finance.company', 'quotes.margin', 'export.csv', 'ai.connector'));

comment on table public.user_permissions is
  'Per-person switches on top of the role (Settings, Users). Admins switch them; every change is in the audit log.';

create or replace function public.rr_user_permission_stamp()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  new.granted_by := coalesce(public.rr_current_email(), '');
  new.granted_at := now();
  return new;
end;
$$;

drop trigger if exists rr_user_permission_stamp on public.user_permissions;
create trigger rr_user_permission_stamp
  before insert or update on public.user_permissions
  for each row execute function public.rr_user_permission_stamp();

------------------------------------------------------------
-- 2. Project members
------------------------------------------------------------
create table if not exists public.delivery_project_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  project_id uuid not null references public.delivery_projects (id) on delete cascade,
  user_id uuid not null references public.app_users (id) on delete cascade,
  added_by text not null default '',
  added_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create index if not exists delivery_project_members_user_idx
  on public.delivery_project_members (user_id);

comment on table public.delivery_project_members is
  'Who is on a project. Sales users see only the projects they are on.';

create or replace function public.rr_project_member_stamp()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  new.added_by := coalesce(public.rr_current_email(), '');
  new.added_at := now();
  return new;
end;
$$;

drop trigger if exists rr_project_member_stamp on public.delivery_project_members;
create trigger rr_project_member_stamp
  before insert on public.delivery_project_members
  for each row execute function public.rr_project_member_stamp();

------------------------------------------------------------
-- 3. Who added a client (clients had no created_by)
------------------------------------------------------------
alter table public.clients add column if not exists created_by text not null default '';

create or replace function public.rr_client_created_by_stamp()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(btrim(new.created_by), '') = '' then
      new.created_by := coalesce(public.rr_current_email(), '');
    end if;
  elsif new.created_by is distinct from old.created_by then
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

drop trigger if exists rr_client_created_by_stamp on public.clients;
create trigger rr_client_created_by_stamp
  before insert or update on public.clients
  for each row execute function public.rr_client_created_by_stamp();

------------------------------------------------------------
-- 4. Helpers. All security definer and stable; the policies wrap each call
--    in (select ...) so it runs once per statement, not once per row.
------------------------------------------------------------
create or replace function public.rr_sales_limited()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(public.rr_current_role() = 'sales', false)
$$;

create or replace function public.rr_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.user_permissions up
    where up.user_id = public.rr_current_user_id()
      and up.permission = p_permission
  )
$$;

-- Sales user with no "see company money" switch: the lock applies.
create or replace function public.rr_sales_locked()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.rr_sales_limited() and not public.rr_has_permission('finance.company')
$$;

-- Email and name of the signed-in user, lower case, for owner columns that
-- hold either one (crm.owner holds the team member's name, or email when blank).
create or replace function public.rr_my_identities()
returns text[]
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(array_agg(distinct v) filter (where v <> ''), '{}'::text[])
  from (
    select lower(btrim(au.email)) as v from public.app_users au where au.id = public.rr_current_user_id()
    union all
    select lower(btrim(au.name)) from public.app_users au where au.id = public.rr_current_user_id()
  ) s
$$;

create or replace function public.rr_sales_account_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(array_agg(a.id), '{}'::uuid[])
  from public.accounts a
  where a.owner_user_id = public.rr_current_user_id()
$$;

-- Normalised names of the signed-in user's clients.
create or replace function public.rr_sales_client_keys()
returns text[]
language sql
stable
security definer
set search_path = public, auth
as $$
  with me as (
    select public.rr_current_user_id() as id, public.rr_current_email() as email, public.rr_my_identities() as who
  ),
  names as (
    select a.name as n from public.accounts a, me
    where a.owner_user_id = me.id and a.deleted_at is null
    union all
    select c.company_name from public.clients c join public.accounts a on a.id = c.account_id, me
    where a.owner_user_id = me.id
    union all
    select c.company_name from public.clients c, me
    where lower(c.created_by) = me.email
    union all
    select l.company_name from public.crm l, me
    where l.deleted_at is null
      and (lower(btrim(l.owner)) = any (me.who)
        or (btrim(l.owner) = '' and lower(btrim(l.created_by)) = me.email))
  )
  select coalesce(array_agg(distinct k) filter (where k <> ''), '{}'::text[])
  from (select public.rr_normalize_company_name(n) as k from names) s
$$;

create or replace function public.rr_sales_client_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(array_agg(c.id), '{}'::uuid[])
  from public.clients c
  where lower(c.created_by) = public.rr_current_email()
     or c.account_id = any (public.rr_sales_account_ids())
     or public.rr_normalize_company_name(c.company_name) = any (public.rr_sales_client_keys())
$$;

create or replace function public.rr_sales_crm_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(array_agg(l.id), '{}'::uuid[])
  from public.crm l
  where lower(btrim(l.owner)) = any (public.rr_my_identities())
     or (btrim(l.owner) = '' and lower(btrim(l.created_by)) = public.rr_current_email())
$$;

-- Quotes that are directly theirs.
create or replace function public.rr_sales_quote_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, auth
as $$
  with k as (
    select public.rr_sales_client_keys() as keys, public.rr_sales_account_ids() as ids,
           public.rr_current_email() as email
  )
  select coalesce(array_agg(q.id), '{}'::uuid[])
  from public.quotations q, k
  where lower(btrim(q.created_by)) = k.email
     or q.account_id = any (k.ids)
     or public.rr_normalize_company_name(q.client) = any (k.keys)
$$;

create or replace function public.rr_sales_invoice_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, auth
as $$
  with k as (
    select public.rr_sales_client_keys() as keys, public.rr_sales_account_ids() as ids,
           public.rr_current_email() as email,
           array(select q.reference_number from public.quotations q
                 where q.id = any (public.rr_sales_quote_ids()) and q.reference_number <> '') as refs
  )
  select coalesce(array_agg(i.id), '{}'::uuid[])
  from public.invoices i, k
  where lower(btrim(i.created_by)) = k.email
     or i.account_id = any (k.ids)
     or public.rr_normalize_company_name(i.client) = any (k.keys)
     or (i.reference_number <> '' and i.reference_number = any (k.refs))
$$;

-- Every document reference that is theirs: quote ref + quote id (quote lines
-- use the quote id), their quotes' revisions, invoice refs, delivery note refs.
create or replace function public.rr_sales_doc_refs()
returns text[]
language sql
stable
security definer
set search_path = public, auth
as $$
  with q as (
    select q.reference_number, q.quote_id, q.base_reference
    from public.quotations q
    where q.id = any (public.rr_sales_quote_ids())
  ),
  qrefs as (
    select reference_number as r from q
    union all select quote_id from q
    union all select base_reference from q
  ),
  qall as (
    -- revisions made by someone else of a quote that is theirs
    select q2.reference_number as r from public.quotations q2
    where q2.base_reference <> '' and q2.base_reference in (select r from qrefs)
    union all
    select q2.quote_id from public.quotations q2
    where q2.base_reference <> '' and q2.base_reference in (select r from qrefs)
  ),
  irefs as (
    select i.reference_number as r from public.invoices i
    where i.id = any (public.rr_sales_invoice_ids())
  ),
  dn as (
    select d.reference_number as r from public.delivery_notes d
    where lower(btrim(d.created_by)) = public.rr_current_email()
       or public.rr_normalize_company_name(d.client) = any (public.rr_sales_client_keys())
       or d.quote_ref in (select r from qrefs union all select r from qall)
       or d.invoice_ref in (select r from irefs)
  )
  select coalesce(array_agg(distinct r) filter (where r <> ''), '{}'::text[])
  from (
    select r from qrefs union all select r from qall union all select r from irefs union all select r from dn
  ) s
$$;

create or replace function public.rr_sales_po_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, auth
as $$
  with k as (
    select public.rr_sales_account_ids() as accts, public.rr_sales_client_ids() as clients,
           public.rr_sales_quote_ids() as quotes, public.rr_sales_invoice_ids() as invoices,
           public.rr_sales_doc_refs() as refs
  )
  select coalesce(array_agg(po.id), '{}'::uuid[])
  from public.client_purchase_orders po, k
  where po.account_id = any (k.accts)
     or po.client_id = any (k.clients)
     or po.quotation_id = any (k.quotes)
     or po.invoice_id = any (k.invoices)
     or (coalesce(po.quote_reference, '') <> '' and po.quote_reference = any (k.refs))
$$;

create or replace function public.rr_sales_project_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(array_agg(distinct id), '{}'::uuid[])
  from (
    select m.project_id as id from public.delivery_project_members m
    where m.user_id = public.rr_current_user_id()
    union all
    select p.id from public.delivery_projects p
    where p.account_id = any (public.rr_sales_account_ids())
  ) s
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'rr_sales_limited()', 'rr_has_permission(text)', 'rr_sales_locked()', 'rr_my_identities()',
    'rr_sales_account_ids()', 'rr_sales_client_keys()', 'rr_sales_client_ids()', 'rr_sales_crm_ids()',
    'rr_sales_quote_ids()', 'rr_sales_invoice_ids()', 'rr_sales_doc_refs()', 'rr_sales_po_ids()',
    'rr_sales_project_ids()'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

------------------------------------------------------------
-- 5. Account helpers used by contracts, sales deals, CTRM deals, tickets ...
--    Same as before, except a Sales user only reaches accounts they own
--    (or reads all with the clients.view_all switch).
------------------------------------------------------------
create or replace function public.rr_can_read_account(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.accounts a
    where a.id = target
      and (
        (public.rr_is_staff()
          and (not public.rr_sales_locked()
            or a.owner_user_id = public.rr_current_user_id()
            or public.rr_has_permission('clients.view_all')))
        or public.rr_current_role() = 'viewer'
        or (public.rr_current_role() = 'staff' and a.owner_user_id = public.rr_current_user_id())
      )
  )
$$;

create or replace function public.rr_can_write_account(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.accounts a
    where a.id = target
      and (
        (public.rr_is_staff()
          and (not public.rr_sales_locked() or a.owner_user_id = public.rr_current_user_id()))
        or (public.rr_current_role() = 'staff' and a.owner_user_id = public.rr_current_user_id())
      )
  )
$$;

------------------------------------------------------------
-- 6. RLS on the two new tables
------------------------------------------------------------
alter table public.user_permissions enable row level security;
alter table public.delivery_project_members enable row level security;
revoke all on public.user_permissions, public.delivery_project_members from anon;
grant select, insert, update, delete on public.user_permissions, public.delivery_project_members to authenticated;

do $$
declare
  t text;
  p record;
begin
  foreach t in array array['user_permissions', 'delivery_project_members'] loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;
    execute format(
      'create policy "Tenant isolation" on public.%I as restrictive for all to authenticated
         using (public.rr_same_tenant(tenant_id)) with check (public.rr_same_tenant(tenant_id))', t);
  end loop;
end $$;

create policy "Managers and the person read switches" on public.user_permissions
  for select to authenticated
  using (public.rr_is_manager_or_admin() or user_id = public.rr_current_user_id());
create policy "Admins switch" on public.user_permissions
  for all to authenticated
  using (public.rr_is_admin()) with check (public.rr_is_admin());

create policy "Team reads project members" on public.delivery_project_members
  for select to authenticated
  using (public.rr_is_manager_or_admin() or user_id = public.rr_current_user_id());
create policy "Managers add project members" on public.delivery_project_members
  for all to authenticated
  using (public.rr_is_manager_or_admin()) with check (public.rr_is_manager_or_admin());

-- Every switch on or off, and every project member change, goes to the audit log.
do $$
declare
  t text;
begin
  if not exists (
    select 1 from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
    where n.nspname = 'public' and pr.proname = 'rr_audit_trigger'
  ) then
    raise notice 'rr_audit_trigger missing, skipping audit on user_permissions';
    return;
  end if;
  foreach t in array array['user_permissions', 'delivery_project_members'] loop
    execute format('drop trigger if exists rr_audit on public.%I', t);
    execute format(
      'create trigger rr_audit after insert or update or delete on public.%I
         for each row execute function public.rr_audit_trigger()', t);
  end loop;
end $$;

-- The AI connector never changes switches or project members.
create or replace function public.rr_mcp_admin_never_write()
returns text[]
language sql
immutable
as $$
  select array[
    'app_users', 'app_settings', 'audit_log', 'fle_access_log', 'api_keys', 'mcp_keys',
    'webhook_endpoints', 'webhook_delivery_attempts', 'mail_accounts', 'mail_links',
    'gmail_connection', 'drive_connection', 'm365_connection', 'tenant_app_identities',
    'mfa_passkey_stubs', 'rate_limit_buckets', 'tenants', 'tenant_subscriptions',
    'tenant_country_packs', 'tenant_industry_packs', 'country_packs', 'industry_packs',
    'business_type_packs', 'numbering_sequences', 'pipelines', 'pipeline_stages',
    'record_rules', 'workflow_definitions', 'workflow_runs', 'custom_field_definitions',
    'sla_policies', 'retention_runs', 'event_outbox', 'dsr_requests',
    'hubspot_links', 'hubspot_sync_runs', 'usage_import_runs', 'digest_runs',
    'fireflies_webhook_events', 'fireflies_webhook_maps', 'ai_usage_log', 'app_errors',
    'activity_log', 'gl_accounts', 'user_permissions', 'delivery_project_members'
  ]::text[]
$$;

------------------------------------------------------------
-- 7. The Sales lock: restrictive policies, one per command.
--    read  = rule for SELECT;  write = rule for INSERT / UPDATE / DELETE.
------------------------------------------------------------
create or replace function public.rr_sales_lock_apply(p_table text, p_read text, p_write text)
returns void
language plpgsql
as $$
begin
  if to_regclass('public.' || p_table) is null then
    raise notice 'sales lock: % missing, skipped', p_table;
    return;
  end if;
  execute format('drop policy if exists "Sales lock (read)" on public.%I', p_table);
  execute format('drop policy if exists "Sales lock (add)" on public.%I', p_table);
  execute format('drop policy if exists "Sales lock (change)" on public.%I', p_table);
  execute format('drop policy if exists "Sales lock (remove)" on public.%I', p_table);
  execute format(
    'create policy "Sales lock (read)" on public.%I as restrictive for select to authenticated
       using (not (select public.rr_sales_locked()) or (%s))', p_table, p_read);
  execute format(
    'create policy "Sales lock (add)" on public.%I as restrictive for insert to authenticated
       with check (not (select public.rr_sales_locked()) or (%s))', p_table, p_write);
  execute format(
    'create policy "Sales lock (change)" on public.%I as restrictive for update to authenticated
       using (not (select public.rr_sales_locked()) or (%s))
       with check (not (select public.rr_sales_locked()) or (%s))', p_table, p_write, p_write);
  execute format(
    'create policy "Sales lock (remove)" on public.%I as restrictive for delete to authenticated
       using (not (select public.rr_sales_locked()) or (%s))', p_table, p_write);
end;
$$;

-- Clients, leads, accounts: own; read all with clients.view_all.
select public.rr_sales_lock_apply('accounts',
  $r$owner_user_id = public.rr_current_user_id() or (select public.rr_has_permission('clients.view_all'))$r$,
  $w$owner_user_id = public.rr_current_user_id()$w$);

select public.rr_sales_lock_apply('clients',
  $r$id = any ((select public.rr_sales_client_ids())::uuid[]) or (select public.rr_has_permission('clients.view_all'))$r$,
  $w$lower(created_by) = (select public.rr_current_email())
     or account_id = any ((select public.rr_sales_account_ids())::uuid[])
     or public.rr_normalize_company_name(company_name) = any ((select public.rr_sales_client_keys())::text[])$w$);

select public.rr_sales_lock_apply('crm',
  $r$lower(btrim(owner)) = any ((select public.rr_my_identities())::text[])
     or (btrim(owner) = '' and lower(btrim(created_by)) = (select public.rr_current_email()))
     or (select public.rr_has_permission('clients.view_all'))$r$,
  $w$lower(btrim(owner)) = any ((select public.rr_my_identities())::text[])
     or (btrim(owner) = '' and lower(btrim(created_by)) = (select public.rr_current_email()))$w$);

select public.rr_sales_lock_apply('follow_up_updates',
  $r$crm_id = any ((select public.rr_sales_crm_ids())::uuid[]) or lower(user_email) = (select public.rr_current_email())$r$,
  $w$crm_id = any ((select public.rr_sales_crm_ids())::uuid[]) or lower(user_email) = (select public.rr_current_email())$w$);

select public.rr_sales_lock_apply('customer_documents',
  $r$crm_id = any ((select public.rr_sales_crm_ids())::uuid[])
     or public.rr_normalize_company_name(company_name) = any ((select public.rr_sales_client_keys())::text[])
     or lower(uploaded_by) = (select public.rr_current_email())$r$,
  $w$crm_id = any ((select public.rr_sales_crm_ids())::uuid[])
     or public.rr_normalize_company_name(company_name) = any ((select public.rr_sales_client_keys())::text[])
     or lower(uploaded_by) = (select public.rr_current_email())$w$);

-- Quotes, invoices, delivery notes and their lines: theirs.
select public.rr_sales_lock_apply('quotations',
  $r$id = any ((select public.rr_sales_quote_ids())::uuid[])
     or (base_reference <> '' and base_reference = any ((select public.rr_sales_doc_refs())::text[]))$r$,
  $w$lower(btrim(created_by)) = (select public.rr_current_email())
     or account_id = any ((select public.rr_sales_account_ids())::uuid[])
     or public.rr_normalize_company_name(client) = any ((select public.rr_sales_client_keys())::text[])
     or (base_reference <> '' and base_reference = any ((select public.rr_sales_doc_refs())::text[]))$w$);

select public.rr_sales_lock_apply('invoices',
  $r$id = any ((select public.rr_sales_invoice_ids())::uuid[])$r$,
  $w$lower(btrim(created_by)) = (select public.rr_current_email())
     or account_id = any ((select public.rr_sales_account_ids())::uuid[])
     or public.rr_normalize_company_name(client) = any ((select public.rr_sales_client_keys())::text[])
     or (reference_number <> '' and reference_number = any ((select public.rr_sales_doc_refs())::text[]))$w$);

select public.rr_sales_lock_apply('delivery_notes',
  $r$lower(btrim(created_by)) = (select public.rr_current_email())
     or public.rr_normalize_company_name(client) = any ((select public.rr_sales_client_keys())::text[])
     or (reference_number <> '' and reference_number = any ((select public.rr_sales_doc_refs())::text[]))
     or client_po_id = any ((select public.rr_sales_po_ids())::uuid[])$r$,
  $w$lower(btrim(created_by)) = (select public.rr_current_email())
     or public.rr_normalize_company_name(client) = any ((select public.rr_sales_client_keys())::text[])
     or (quote_ref <> '' and quote_ref = any ((select public.rr_sales_doc_refs())::text[]))
     or (coalesce(invoice_ref, '') <> '' and invoice_ref = any ((select public.rr_sales_doc_refs())::text[]))
     or client_po_id = any ((select public.rr_sales_po_ids())::uuid[])$w$);

select public.rr_sales_lock_apply('line_items',
  $r$reference = any ((select public.rr_sales_doc_refs())::text[])$r$,
  $w$reference = any ((select public.rr_sales_doc_refs())::text[])$w$);

select public.rr_sales_lock_apply('quote_notes',
  $r$quotation_id = any ((select public.rr_sales_quote_ids())::uuid[])
     or (coalesce(quote_ref, '') <> '' and quote_ref = any ((select public.rr_sales_doc_refs())::text[]))
     or (coalesce(base_reference, '') <> '' and base_reference = any ((select public.rr_sales_doc_refs())::text[]))$r$,
  $w$quotation_id = any ((select public.rr_sales_quote_ids())::uuid[])
     or (coalesce(quote_ref, '') <> '' and quote_ref = any ((select public.rr_sales_doc_refs())::text[]))$w$);

select public.rr_sales_lock_apply('quote_accept_links',
  $r$quotation_id = any ((select public.rr_sales_quote_ids())::uuid[])$r$,
  $w$quotation_id = any ((select public.rr_sales_quote_ids())::uuid[])$w$);

-- Client POs (record a PO for their client or their quote).
select public.rr_sales_lock_apply('client_purchase_orders',
  $r$id = any ((select public.rr_sales_po_ids())::uuid[])$r$,
  $w$account_id = any ((select public.rr_sales_account_ids())::uuid[])
     or client_id = any ((select public.rr_sales_client_ids())::uuid[])
     or quotation_id = any ((select public.rr_sales_quote_ids())::uuid[])
     or invoice_id = any ((select public.rr_sales_invoice_ids())::uuid[])$w$);

select public.rr_sales_lock_apply('client_po_drawdowns',
  $r$po_id = any ((select public.rr_sales_po_ids())::uuid[])$r$,
  $w$po_id = any ((select public.rr_sales_po_ids())::uuid[])$w$);

select public.rr_sales_lock_apply('client_uniform_staff',
  $r$client_id = any ((select public.rr_sales_client_ids())::uuid[])$r$,
  $w$client_id = any ((select public.rr_sales_client_ids())::uuid[])$w$);

select public.rr_sales_lock_apply('client_uniform_issues',
  $r$po_id = any ((select public.rr_sales_po_ids())::uuid[])
     or exists (select 1 from public.client_uniform_staff s where s.id = staff_id)$r$,
  $w$po_id = any ((select public.rr_sales_po_ids())::uuid[])
     or exists (select 1 from public.client_uniform_staff s where s.id = staff_id)$w$);

-- Projects: the ones they are on; read only. Project money stays closed.
select public.rr_sales_lock_apply('delivery_projects',
  $r$id = any ((select public.rr_sales_project_ids())::uuid[])$r$,
  $w$false$w$);

-- Money that follows their own invoices: the invoice screen keeps income in
-- step with each invoice, so they may write income rows of their invoices.
-- Payments of their invoices are read only.
select public.rr_sales_lock_apply('income',
  $r$reference_number <> '' and reference_number = any ((select public.rr_sales_doc_refs())::text[])$r$,
  $w$reference_number <> '' and reference_number = any ((select public.rr_sales_doc_refs())::text[])$w$);

select public.rr_sales_lock_apply('payment_log',
  $r$invoice_ref <> '' and invoice_ref = any ((select public.rr_sales_doc_refs())::text[])$r$,
  $w$false$w$);

select public.rr_sales_lock_apply('customer_payments',
  $r$(invoice_ref <> '' and invoice_ref = any ((select public.rr_sales_doc_refs())::text[]))
     or (quote_ref <> '' and quote_ref = any ((select public.rr_sales_doc_refs())::text[]))$r$,
  $w$false$w$);

-- Company money: closed to Sales (open with the finance.company switch).
do $$
declare
  t text;
begin
  foreach t in array array[
    'expenses', 'attachments', 'vendors', 'supplier_commitments', 'supplier_advances',
    'supplier_advance_applications', 'purchase_orders', 'purchase_order_lines',
    'project_cost_lines', 'project_billing_schedules', 'customer_refunds',
    'invoice_chase_tasks', 'invoice_chase_log', 'invoice_reminders', 'ar_chase_settings',
    'contract_invoices', 'inventory_movements', 'planning_goals', 'planning_scenarios',
    'usage_records', 'ai_usage_log'
  ] loop
    perform public.rr_sales_lock_apply(t, 'false', 'false');
  end loop;
end $$;

-- Only this file uses the helper.
drop function if exists public.rr_sales_lock_apply(text, text, text);

------------------------------------------------------------
-- 8. AI connector (MCP): never writes or deletes switches or project members
------------------------------------------------------------
do $$
declare
  t text;
begin
  if to_regprocedure('public.rr_mcp_key_id()') is null then
    return;
  end if;
  foreach t in array array['user_permissions', 'delivery_project_members'] loop
    execute format('drop policy if exists "AI never writes access" on public.%I', t);
    execute format(
      'create policy "AI never writes access" on public.%I as restrictive for all to authenticated
         using (true) with check (public.rr_mcp_key_id() is null)', t);
    execute format('drop policy if exists "MCP never deletes" on public.%I', t);
    execute format(
      'create policy "MCP never deletes" on public.%I as restrictive for delete to authenticated
         using (public.rr_mcp_key_id() is null)', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
