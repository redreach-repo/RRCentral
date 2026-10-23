-- RR Central modules, Phase 1: accounts, contacts, activity timeline, roles.
--
-- * One `accounts` list for every organisation Red Reach deals with
--   (AI CRM clients, WorshipHub churches, CTRM Next prospects).
-- * `account_contacts` and `account_activities` hang off an account.
-- * Two new roles on app_users: `staff` (sees only accounts they own) and
--   `viewer` (read only). Existing admin / manager / sales keep working as before.
-- * `clients`, `quotations` and `invoices` get a nullable `account_id`.
--   Nothing is renamed or rewritten; invoice numbering is untouched.
--   Linking is done by rr_link_accounts() below, dry run first.
--
-- Safe to re-run. Run after 20261009200000_mass_allied_freighters_client.sql.
-- NOTE: this narrows rr_is_staff() to admin/manager/sales. If you ever re-run
-- 20260926090000_security_rls.sql, re-run this file afterwards.

------------------------------------------------------------
-- 1. Roles
------------------------------------------------------------
alter table app_users drop constraint if exists app_users_role_check;
alter table app_users
  add constraint app_users_role_check
  check (role in ('admin', 'manager', 'sales', 'staff', 'viewer'));

create or replace function public.rr_current_role()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select au.role from public.app_users au
  where lower(au.email) = public.rr_current_email()
    and au.active
  limit 1
$$;

create or replace function public.rr_current_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select au.id from public.app_users au
  where lower(au.email) = public.rr_current_email()
    and au.active
  limit 1
$$;

-- Any active team member, whatever the role.
create or replace function public.rr_is_member()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.rr_current_role() is not null
$$;

-- "Staff" in the original sense: full day to day access to the old tables.
-- New restricted roles (staff, viewer) are deliberately left out.
create or replace function public.rr_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(public.rr_current_role() in ('admin', 'manager', 'sales'), false)
$$;

revoke all on function public.rr_current_role() from public;
revoke all on function public.rr_current_user_id() from public;
revoke all on function public.rr_is_member() from public;
revoke all on function public.rr_is_staff() from public;
grant execute on function public.rr_current_role() to authenticated;
grant execute on function public.rr_current_user_id() to authenticated;
grant execute on function public.rr_is_member() to authenticated;
grant execute on function public.rr_is_staff() to authenticated;

-- Restricted roles still need the team list (to see who owns what) and
-- ordinary settings (company name, branding). Secrets stay hidden.
drop policy if exists "Members read users" on app_users;
create policy "Members read users" on app_users
  for select to authenticated using (public.rr_is_member());

drop policy if exists "Members read non-secret settings" on app_settings;
create policy "Members read non-secret settings" on app_settings
  for select to authenticated
  using (public.rr_is_member() and not public.rr_is_secret_setting(key));

-- Viewers may read the operational tables (never secrets, users, audit or the
-- company document vault). They can write nothing.
do $$
declare
  t record;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename not in (
        'app_users', 'app_settings', 'audit_log', 'company_documents',
        'website_inquiries', 'accounts', 'account_contacts',
        'account_activities', 'account_link_log'
      )
  loop
    execute format('drop policy if exists "Viewers read" on public.%I', t.tablename);
    execute format(
      'create policy "Viewers read" on public.%I for select to authenticated
         using (public.rr_current_role() = ''viewer'')',
      t.tablename
    );
  end loop;
end $$;

------------------------------------------------------------
-- 2. Accounts
------------------------------------------------------------
create table if not exists public.accounts (
  id uuid primary key default uuid_generate_v4(),
  type text not null check (type in ('ai_crm_client', 'worship_church', 'ctrm_prospect')),
  name text not null,
  reference text not null default '',
  industry text not null default '',
  country text not null default '',
  city text not null default '',
  website text not null default '',
  status text not null default 'active',
  owner_user_id uuid references public.app_users(id) on delete set null,
  source text not null default '',
  notes text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists accounts_reference_key
  on public.accounts (reference) where reference <> '';
create index if not exists idx_accounts_type on public.accounts (type);
create index if not exists idx_accounts_owner on public.accounts (owner_user_id);
create index if not exists idx_accounts_name_lower on public.accounts (lower(name));

create table if not exists public.account_contacts (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null default '',
  role text not null default '',
  email text not null default '',
  phone text not null default '',
  whatsapp text not null default '',
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_account_contacts_account on public.account_contacts (account_id);

create table if not exists public.account_activities (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid references public.app_users(id) on delete set null,
  user_email text not null default '',
  kind text not null default 'note' check (kind in ('note', 'call', 'email', 'meeting', 'system')),
  body text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_account_activities_account
  on public.account_activities (account_id, created_at desc);

-- Link the existing money tables (nullable, filled by rr_link_accounts or the UI).
alter table public.clients add column if not exists account_id uuid
  references public.accounts(id) on delete set null;
alter table public.quotations add column if not exists account_id uuid
  references public.accounts(id) on delete set null;
alter table public.invoices add column if not exists account_id uuid
  references public.accounts(id) on delete set null;
create index if not exists idx_clients_account on public.clients (account_id);
create index if not exists idx_quotations_account on public.quotations (account_id);
create index if not exists idx_invoices_account on public.invoices (account_id);

------------------------------------------------------------
-- 3. Account access helpers
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
        public.rr_is_staff()
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
        public.rr_is_staff()
        or (public.rr_current_role() = 'staff' and a.owner_user_id = public.rr_current_user_id())
      )
  )
$$;

revoke all on function public.rr_can_read_account(uuid) from public;
revoke all on function public.rr_can_write_account(uuid) from public;
grant execute on function public.rr_can_read_account(uuid) to authenticated;
grant execute on function public.rr_can_write_account(uuid) to authenticated;

------------------------------------------------------------
-- 4. Row Level Security
------------------------------------------------------------
alter table public.accounts enable row level security;
alter table public.account_contacts enable row level security;
alter table public.account_activities enable row level security;
revoke all on public.accounts, public.account_contacts, public.account_activities from anon;
grant select, insert, update, delete
  on public.accounts, public.account_contacts, public.account_activities to authenticated;

-- 20260926090000_security_rls.sql gives every table a blanket "Staff full access"
-- policy when it is re-run; the new tables must never carry it.
do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'account_contacts', 'account_activities', 'account_link_log'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "Staff full access" on public.%I', t);
    end if;
  end loop;
end $$;

drop policy if exists "Read visible accounts" on public.accounts;
drop policy if exists "Create accounts" on public.accounts;
drop policy if exists "Edit own or all accounts" on public.accounts;
drop policy if exists "Managers delete accounts" on public.accounts;
create policy "Read visible accounts" on public.accounts
  for select to authenticated
  using (
    public.rr_is_staff()
    or public.rr_current_role() = 'viewer'
    or (public.rr_current_role() = 'staff' and owner_user_id = public.rr_current_user_id())
  );
create policy "Create accounts" on public.accounts
  for insert to authenticated
  with check (
    public.rr_is_staff()
    or (public.rr_current_role() = 'staff' and owner_user_id = public.rr_current_user_id())
  );
create policy "Edit own or all accounts" on public.accounts
  for update to authenticated
  using (
    public.rr_is_staff()
    or (public.rr_current_role() = 'staff' and owner_user_id = public.rr_current_user_id())
  )
  with check (
    public.rr_is_staff()
    or (public.rr_current_role() = 'staff' and owner_user_id = public.rr_current_user_id())
  );
create policy "Managers delete accounts" on public.accounts
  for delete to authenticated using (public.rr_is_manager_or_admin());

drop policy if exists "Read contacts on visible accounts" on public.account_contacts;
drop policy if exists "Write contacts on editable accounts" on public.account_contacts;
create policy "Read contacts on visible accounts" on public.account_contacts
  for select to authenticated using (public.rr_can_read_account(account_id));
create policy "Write contacts on editable accounts" on public.account_contacts
  for all to authenticated
  using (public.rr_can_write_account(account_id))
  with check (public.rr_can_write_account(account_id));

drop policy if exists "Read timeline on visible accounts" on public.account_activities;
drop policy if exists "Add to timeline on editable accounts" on public.account_activities;
drop policy if exists "Managers edit timeline" on public.account_activities;
drop policy if exists "Managers delete timeline" on public.account_activities;
create policy "Read timeline on visible accounts" on public.account_activities
  for select to authenticated using (public.rr_can_read_account(account_id));
create policy "Add to timeline on editable accounts" on public.account_activities
  for insert to authenticated
  with check (
    public.rr_can_write_account(account_id)
    and (user_id is null or user_id = public.rr_current_user_id())
  );
create policy "Managers edit timeline" on public.account_activities
  for update to authenticated
  using (public.rr_is_manager_or_admin()) with check (public.rr_is_manager_or_admin());
create policy "Managers delete timeline" on public.account_activities
  for delete to authenticated using (public.rr_is_manager_or_admin());

-- Only managers and admins reassign an account once it exists (same rule as CRM owner).
create or replace function public.rr_account_owner_guard()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if tg_op = 'UPDATE'
     and new.owner_user_id is distinct from old.owner_user_id
     and auth.uid() is not null
     and not public.rr_is_manager_or_admin() then
    raise exception 'Only managers and admins can reassign an account'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists rr_account_owner_guard on public.accounts;
create trigger rr_account_owner_guard
  before update on public.accounts
  for each row execute function public.rr_account_owner_guard();

-- Audit trail on the new tables.
do $$
declare
  t text;
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rr_audit_trigger'
  ) then
    raise notice 'rr_audit_trigger missing, skipping audit on accounts';
    return;
  end if;
  foreach t in array array['accounts', 'account_contacts', 'account_activities'] loop
    execute format('drop trigger if exists rr_audit on public.%I', t);
    execute format(
      'create trigger rr_audit after insert or update or delete on public.%I
         for each row execute function public.rr_audit_trigger()',
      t
    );
  end loop;
end $$;

------------------------------------------------------------
-- 5. Linking existing clients, quotations and invoices to accounts
--
-- Run these in the Supabase SQL editor only (not callable from the app):
--   select * from rr_link_accounts();                -- dry run, changes nothing
--   select * from rr_link_accounts(p_dry_run => false); -- fills empty account_id
--   select rr_unlink_accounts('<batch id>');         -- undo one apply
------------------------------------------------------------
create table if not exists public.account_link_log (
  id bigserial primary key,
  batch_id uuid not null,
  table_name text not null check (table_name in ('clients', 'quotations', 'invoices')),
  row_id uuid not null,
  account_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_account_link_log_batch on public.account_link_log (batch_id);
alter table public.account_link_log enable row level security;
revoke all on public.account_link_log from anon, authenticated;
grant select on public.account_link_log to authenticated;
drop policy if exists "Staff full access" on public.account_link_log;
drop policy if exists "Admins read link log" on public.account_link_log;
create policy "Admins read link log" on public.account_link_log
  for select to authenticated using (public.rr_is_admin());

-- "Al Noor Trading L.L.C." and "al noor" compare equal.
create or replace function public.rr_normalize_company_name(raw text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(coalesce(raw, '')), '[^a-z0-9]+', ' ', 'g'),
        '\ml l c\M', 'llc', 'g'
      ),
      '\m(the|llc|fze|fzco|fz|fzc|co|company|ltd|limited|est|establishment|trading|inc|plc|llp|dmcc)\M',
      '', 'g'
    ),
    '\s+', ' ', 'g'
  ))
$$;

create or replace function public.rr_link_accounts(p_dry_run boolean default true)
returns table (
  kind text,
  table_name text,
  row_id uuid,
  row_label text,
  account_id uuid,
  account_name text,
  account_reference text,
  batch_id uuid
)
language plpgsql
set search_path = public
as $$
declare
  v_batch uuid := case when p_dry_run then null else uuid_generate_v4() end;
begin
  create temp table if not exists rr_link_candidates (
    kind text, table_name text, row_id uuid, row_label text,
    account_id uuid, account_name text, account_reference text
  ) on commit drop;
  truncate rr_link_candidates;

  -- Account names that normalise to the same key are ambiguous: never auto-link.
  insert into rr_link_candidates
  with acct as (
    select a.id, a.name, a.reference, public.rr_normalize_company_name(a.name) as k,
      count(*) over (partition by public.rr_normalize_company_name(a.name)) as dupes
    from public.accounts a
    where public.rr_normalize_company_name(a.name) <> ''
  ),
  rows_ as (
    select 'clients'::text as t, c.id, c.company_name as name, c.company_name as label,
      c.account_id as linked
      from public.clients c
    union all
    select 'quotations', q.id, q.client, q.client || ' (' || q.reference_number || ')', q.account_id
      from public.quotations q
    union all
    select 'invoices', i.id, i.client, i.client || ' (' || i.reference_number || ')', i.account_id
      from public.invoices i
  ),
  keyed as (
    select r.*, public.rr_normalize_company_name(r.name) as k from rows_ r
  )
  select
    case
      when k.linked is not null then 'already_linked'
      when a.id is null then 'unmatched'
      when a.dupes > 1 then 'ambiguous'
      else 'match'
    end,
    k.t, k.id, k.label, a.id, a.name, a.reference
  from keyed k
  left join acct a on a.k = k.k and k.k <> '';

  -- Accounts with nothing to link to (worth a look: maybe a spelling difference).
  insert into rr_link_candidates
  select 'account_without_match', 'accounts', a.id, a.name, a.id, a.name, a.reference
  from public.accounts a
  where not exists (
    select 1 from rr_link_candidates c
    where c.account_id = a.id and c.kind in ('match', 'already_linked')
  );

  if not p_dry_run then
    insert into public.account_link_log (batch_id, table_name, row_id, account_id)
    select v_batch, c.table_name, c.row_id, c.account_id
    from rr_link_candidates c where c.kind = 'match';

    update public.clients t set account_id = c.account_id
      from rr_link_candidates c
      where c.kind = 'match' and c.table_name = 'clients' and t.id = c.row_id and t.account_id is null;
    update public.quotations t set account_id = c.account_id
      from rr_link_candidates c
      where c.kind = 'match' and c.table_name = 'quotations' and t.id = c.row_id and t.account_id is null;
    update public.invoices t set account_id = c.account_id
      from rr_link_candidates c
      where c.kind = 'match' and c.table_name = 'invoices' and t.id = c.row_id and t.account_id is null;
  end if;

  return query
    select c.kind, c.table_name, c.row_id, c.row_label, c.account_id, c.account_name,
      c.account_reference, v_batch
    from rr_link_candidates c
    order by
      array_position(array['match', 'ambiguous', 'account_without_match', 'unmatched', 'already_linked'], c.kind),
      c.table_name, c.row_label;
end;
$$;

create or replace function public.rr_unlink_accounts(p_batch_id uuid)
returns integer
language plpgsql
set search_path = public
as $$
declare
  n integer := 0;
  m integer;
begin
  update public.clients t set account_id = null from public.account_link_log l
    where l.batch_id = p_batch_id and l.table_name = 'clients' and t.id = l.row_id and t.account_id = l.account_id;
  get diagnostics m = row_count; n := n + m;
  update public.quotations t set account_id = null from public.account_link_log l
    where l.batch_id = p_batch_id and l.table_name = 'quotations' and t.id = l.row_id and t.account_id = l.account_id;
  get diagnostics m = row_count; n := n + m;
  update public.invoices t set account_id = null from public.account_link_log l
    where l.batch_id = p_batch_id and l.table_name = 'invoices' and t.id = l.row_id and t.account_id = l.account_id;
  get diagnostics m = row_count; n := n + m;
  delete from public.account_link_log where batch_id = p_batch_id;
  return n;
end;
$$;

-- SQL editor only: the app and the public key can never run these.
revoke all on function public.rr_link_accounts(boolean) from public, anon, authenticated;
revoke all on function public.rr_unlink_accounts(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
