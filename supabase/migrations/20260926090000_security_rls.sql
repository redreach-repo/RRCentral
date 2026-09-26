-- RED REACH Central — lock down Row Level Security
--
-- Before this migration:
--   * ANY signed-in Supabase user (e.g. any Google account) could read and
--     write every table — the admin/sales split only existed in the UI.
--   * `vendors` and `customer_documents` also had "Anon full access" policies,
--     so anyone holding the public anon key (it ships in the website bundle)
--     could read, change or delete them without signing in.
--
-- After this migration:
--   * Only people listed in `app_users` with `active = true` and a confirmed
--     email ("staff") can use Central's data.
--   * Admin-only: managing users, changing company/bank/integration settings,
--     reading integration secrets, deleting invoices/expenses, reading the
--     audit trail.
--   * Anonymous visitors can only INSERT a website inquiry (contact form).
--
-- Safe to re-run. Run it in the Supabase SQL editor (or `supabase db push`).
-- IMPORTANT: make sure your own email is in app_users as an active admin
-- before running, or you will lock yourself out (see the insert at the end).

------------------------------------------------------------
-- Helper functions (security definer so they can read app_users / auth.users
-- without recursing through RLS)
------------------------------------------------------------
create or replace function public.rr_current_email()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select lower(u.email)
  from auth.users u
  where u.id = auth.uid()
    and u.email_confirmed_at is not null
$$;

create or replace function public.rr_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.app_users au
    where lower(au.email) = public.rr_current_email()
      and au.active
  )
$$;

create or replace function public.rr_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.app_users au
    where lower(au.email) = public.rr_current_email()
      and au.active
      and au.role = 'admin'
  )
$$;

-- Integration secrets: hidden from non-admin staff.
create or replace function public.rr_is_secret_setting(setting_key text)
returns boolean
language sql
immutable
as $$
  select setting_key ilike '%secret%'
    or setting_key ilike '%token%'
    or setting_key ilike '%password%'
    or setting_key ilike '%apikey%'
$$;

-- Settings that only admins may change (includes every secret).
create or replace function public.rr_is_protected_setting(setting_key text)
returns boolean
language sql
immutable
as $$
  select setting_key in (
      'companyName', 'accountName', 'bankName', 'bankAccount', 'iban', 'swift',
      'trn', 'vatRate', 'currency', 'email', 'address', 'apiToken'
    )
    or public.rr_is_secret_setting(setting_key)
    or setting_key ilike 'zoho%'
$$;

revoke all on function public.rr_current_email() from public;
revoke all on function public.rr_is_staff() from public;
revoke all on function public.rr_is_admin() from public;
grant execute on function public.rr_current_email() to authenticated;
grant execute on function public.rr_is_staff() to authenticated;
grant execute on function public.rr_is_admin() to authenticated;

------------------------------------------------------------
-- 1. Enable RLS everywhere and drop every existing policy
------------------------------------------------------------
do $$
declare
  t record;
  p record;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;

  for p in
    select policyname, tablename from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

------------------------------------------------------------
-- 2. Default: staff can read/write operational tables
------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename not in (
        'app_users', 'app_settings', 'website_inquiries', 'activity_log',
        'audit_log', 'invoices', 'expenses'
      )
  loop
    execute format(
      'create policy "Staff full access" on public.%I for all to authenticated
         using (public.rr_is_staff()) with check (public.rr_is_staff())',
      t.tablename
    );
  end loop;
end $$;

------------------------------------------------------------
-- 3. Tables with stricter rules
------------------------------------------------------------

-- Users: staff can see the team list; only admins manage it.
create policy "Staff read users" on app_users
  for select to authenticated using (public.rr_is_staff());
create policy "Admins manage users" on app_users
  for all to authenticated
  using (public.rr_is_admin()) with check (public.rr_is_admin());

-- Settings: secrets are admin-only to read; protected keys admin-only to write.
create policy "Staff read non-secret settings" on app_settings
  for select to authenticated
  using (public.rr_is_admin() or (public.rr_is_staff() and not public.rr_is_secret_setting(key)));
create policy "Staff insert non-protected settings" on app_settings
  for insert to authenticated
  with check (public.rr_is_admin() or (public.rr_is_staff() and not public.rr_is_protected_setting(key)));
create policy "Staff update non-protected settings" on app_settings
  for update to authenticated
  using (public.rr_is_admin() or (public.rr_is_staff() and not public.rr_is_protected_setting(key)))
  with check (public.rr_is_admin() or (public.rr_is_staff() and not public.rr_is_protected_setting(key)));
create policy "Admins delete settings" on app_settings
  for delete to authenticated using (public.rr_is_admin());

-- Invoices & expenses: staff create/edit, only admins delete.
do $$
declare
  t text;
begin
  foreach t in array array['invoices', 'expenses'] loop
    if to_regclass('public.' || t) is not null then
      execute format('create policy "Staff read" on public.%I for select to authenticated using (public.rr_is_staff())', t);
      execute format('create policy "Staff insert" on public.%I for insert to authenticated with check (public.rr_is_staff())', t);
      execute format('create policy "Staff update" on public.%I for update to authenticated using (public.rr_is_staff()) with check (public.rr_is_staff())', t);
      execute format('create policy "Admins delete" on public.%I for delete to authenticated using (public.rr_is_admin())', t);
    end if;
  end loop;
end $$;

-- Activity log: append-only for staff; admins may clean up.
create policy "Staff read activity" on activity_log
  for select to authenticated using (public.rr_is_staff());
create policy "Staff add activity" on activity_log
  for insert to authenticated with check (public.rr_is_staff());
create policy "Admins manage activity" on activity_log
  for update to authenticated using (public.rr_is_admin()) with check (public.rr_is_admin());
create policy "Admins delete activity" on activity_log
  for delete to authenticated using (public.rr_is_admin());

-- Audit trail (written by triggers only): admins read.
do $$
begin
  if to_regclass('public.audit_log') is not null then
    execute 'create policy "Admins read audit log" on public.audit_log for select to authenticated using (public.rr_is_admin())';
  end if;
end $$;

-- Website inquiries: public contact form may insert only a fresh, bounded row.
create policy "Staff manage inquiries" on website_inquiries
  for all to authenticated
  using (public.rr_is_staff()) with check (public.rr_is_staff());
create policy "Public submit inquiry" on website_inquiries
  for insert to anon, authenticated
  with check (
    status = 'new'
    and crm_id = ''
    and char_length(name) between 1 and 200
    and char_length(email) between 3 and 320
    and email like '%_@_%'
    and char_length(phone) <= 50
    and char_length(vertical) <= 100
    and char_length(message) <= 5000
  );

------------------------------------------------------------
-- 4. Anonymous role gets nothing else
------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke all on public.%I from anon', t.tablename);
  end loop;
end $$;
grant insert on public.website_inquiries to anon;

------------------------------------------------------------
-- 5. Make sure the founding admins exist (no-op if already present)
------------------------------------------------------------
insert into app_users (email, name, role, active) values
  ('alfredsv@gmail.com', 'Alfred', 'admin', true),
  ('redreachdxb@gmail.com', 'Red Reach DXB', 'admin', true),
  ('alfred@redreach.ae', 'Alfred', 'admin', true),
  ('jacob@redreach.ae', 'Jacob', 'admin', true)
on conflict (email) do nothing;

notify pgrst, 'reload schema';
