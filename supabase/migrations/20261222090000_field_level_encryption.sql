-- Gap plan module 5: Field-level encryption (docs/modules/field-level-encryption.md).
--
-- Encrypts chosen columns with AES-256 (pgcrypto pgp_sym_encrypt) under a key
-- kept in Supabase Vault (secret name hm_fle_key_v<N>), never in a table or
-- in this repo. Ciphertext is stored as  fle:v<N>:<base64>  so keys can rotate.
-- Only roles allowed for a field get the plain value back (rr_hr_sensitive);
-- everyone else gets a masked value. Every plain read is logged.
--
-- First use: HR salary and IBAN (hr_employees, Cursor #413/#415). Encryption
-- runs on every save once the Vault key exists. Blanking the plain columns is
-- opt-in (app setting fle.enforce.hr = true) so Cursor's pages keep working
-- until they read through rr_hr_sensitive().
-- Safe to re-run.

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Same column as Cursor's #415 (idempotent either way).
alter table public.hr_employees add column if not exists iban text not null default '';
alter table public.hr_employees add column if not exists basic_salary_enc text;
alter table public.hr_employees add column if not exists iban_enc text;

create table if not exists public.fle_access_log (
  id bigserial primary key,
  tenant_id uuid not null default 'a0000000-0000-4000-8000-000000000001'::uuid
    references public.tenants (id) on delete cascade,
  field_key text not null,
  row_id text not null,
  actor_email text not null default '',
  outcome text not null check (outcome in ('plain', 'masked')),
  created_at timestamptz not null default now()
);
create index if not exists fle_access_log_idx on public.fle_access_log (tenant_id, created_at desc);

------------------------------------------------------------
-- Internals (not callable by app users)
------------------------------------------------------------
-- Schema where pgcrypto lives (Supabase: extensions; elsewhere maybe public).
create or replace function public.rr_fle_crypto_schema()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select n.nspname::text from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto'
$$;

create or replace function public.rr_fle_current_version()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif((select value from public.app_settings where key = 'fle.key_version'), '')::int, 1)
$$;

-- Key from Supabase Vault, or null when not set up.
create or replace function public.rr_fle_key(p_version int)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  k text;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    return null;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
    into k using 'hm_fle_key_v' || p_version;
  if k is not null and length(k) < 32 then
    raise exception 'Field encryption key hm_fle_key_v% is too short (need 32+ characters)', p_version;
  end if;
  return k;
end;
$$;

create or replace function public.rr_fle_ready()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.rr_fle_key(public.rr_fle_current_version()) is not null
$$;

create or replace function public.rr_fle_encrypt(p_plain text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v int := public.rr_fle_current_version();
  k text := public.rr_fle_key(v);
  c bytea;
begin
  if p_plain is null then
    return null;
  end if;
  if k is null then
    raise exception 'Field encryption key hm_fle_key_v% is not set up in Vault', v;
  end if;
  execute format('select %I.pgp_sym_encrypt($1, $2, %L)', public.rr_fle_crypto_schema(), 'cipher-algo=aes256')
    into c using p_plain, k;
  return 'fle:v' || v || ':' || translate(encode(c, 'base64'), E'\n', '');
end;
$$;

create or replace function public.rr_fle_decrypt(p_cipher text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m text[];
  k text;
  plain text;
begin
  if p_cipher is null then
    return null;
  end if;
  m := regexp_match(p_cipher, '^fle:v(\d+):(.+)$');
  if m is null then
    raise exception 'Not an encrypted value';
  end if;
  k := public.rr_fle_key(m[1]::int);
  if k is null then
    raise exception 'Field encryption key hm_fle_key_v% is not available', m[1];
  end if;
  execute format('select %I.pgp_sym_decrypt(decode($1, %L), $2)', public.rr_fle_crypto_schema(), 'base64')
    into plain using m[2], k;
  return plain;
end;
$$;

-- Masks for people who may not see the value.
create or replace function public.rr_fle_mask(p_plain text, p_kind text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_plain is null or p_plain = '' then p_plain
    when p_kind = 'iban' then left(regexp_replace(p_plain, '\s', '', 'g'), 2) || '•• •••• ' || right(regexp_replace(p_plain, '\s', '', 'g'), 4)
    else '•••'
  end
$$;

-- Who may read a field in plain text.
create or replace function public.rr_fle_can_read(p_field text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select case
    when p_field in ('hr.basic_salary', 'hr.iban') then public.rr_is_manager_or_admin()
    else public.rr_is_admin()
  end
$$;

revoke all on function public.rr_fle_crypto_schema() from public, anon, authenticated;
revoke all on function public.rr_fle_current_version() from public, anon, authenticated;
revoke all on function public.rr_fle_key(int) from public, anon, authenticated;
revoke all on function public.rr_fle_encrypt(text) from public, anon, authenticated;
revoke all on function public.rr_fle_decrypt(text) from public, anon, authenticated;
revoke all on function public.rr_fle_ready() from public, anon;
grant execute on function public.rr_fle_ready() to authenticated;
grant execute on function public.rr_fle_mask(text, text) to authenticated;
grant execute on function public.rr_fle_can_read(text) to authenticated;

------------------------------------------------------------
-- HR: encrypt on save; blank plain columns when enforced
------------------------------------------------------------
create or replace function public.rr_fle_hr_employees()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  enforce boolean := coalesce((select value from public.app_settings where key = 'fle.enforce.hr') = 'true', false);
  ready boolean := public.rr_fle_ready();
begin
  if not ready then
    if enforce then
      raise exception 'Salary and IBAN must be encrypted, but the Vault key is not set up (docs/modules/field-level-encryption.md)';
    end if;
    return new;
  end if;

  if new.basic_salary_aed is not null then
    new.basic_salary_enc := public.rr_fle_encrypt(new.basic_salary_aed::text);
  elsif tg_op = 'INSERT' then
    new.basic_salary_enc := null;
  end if;
  if coalesce(new.iban, '') <> '' then
    new.iban_enc := public.rr_fle_encrypt(new.iban);
  elsif tg_op = 'INSERT' then
    new.iban_enc := null;
  end if;

  if enforce then
    new.basic_salary_aed := null;
    new.iban := '';
  end if;
  return new;
end;
$$;

drop trigger if exists rr_fle_hr_employees on public.hr_employees;
create trigger rr_fle_hr_employees
  before insert or update on public.hr_employees
  for each row execute function public.rr_fle_hr_employees();

-- The one way the app should read salary and IBAN. Plain for manager/admin, masked for others. Logged.
create or replace function public.rr_hr_sensitive(p_employee_id uuid)
returns table (employee_id uuid, basic_salary_aed numeric, iban text, masked boolean)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  r public.hr_employees;
  salary_plain text;
  iban_plain text;
  allowed boolean;
begin
  if not public.rr_is_member() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into r from public.hr_employees e
  where e.id = p_employee_id and e.tenant_id = public.rr_my_tenant_id();
  if not found then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;

  salary_plain := case when r.basic_salary_enc is not null then public.rr_fle_decrypt(r.basic_salary_enc) else r.basic_salary_aed::text end;
  iban_plain := case when r.iban_enc is not null then public.rr_fle_decrypt(r.iban_enc) else r.iban end;
  allowed := public.rr_fle_can_read('hr.basic_salary');

  insert into public.fle_access_log (tenant_id, field_key, row_id, actor_email, outcome)
  values (r.tenant_id, 'hr.basic_salary+hr.iban', r.id::text, coalesce(public.rr_current_email(), ''),
          case when allowed then 'plain' else 'masked' end);

  if allowed then
    return query select r.id, salary_plain::numeric, iban_plain, false;
  else
    return query select r.id, null::numeric, public.rr_fle_mask(iban_plain, 'iban'), true;
  end if;
end;
$$;

-- Encrypt rows saved before the key existed, or re-encrypt after a key version change. Admin only.
create or replace function public.rr_fle_reencrypt_hr()
returns int
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  n int := 0;
  e record;
  salary_plain text;
  iban_plain text;
  enforce boolean := coalesce((select value from public.app_settings where key = 'fle.enforce.hr') = 'true', false);
begin
  if auth.uid() is not null and not public.rr_is_admin() then
    raise exception 'Only an admin can re-encrypt' using errcode = '42501';
  end if;
  if not public.rr_fle_ready() then
    raise exception 'Vault key hm_fle_key_v% is not set up', public.rr_fle_current_version();
  end if;
  for e in select * from public.hr_employees
           where auth.uid() is null or tenant_id = public.rr_my_tenant_id()
  loop
    salary_plain := coalesce(public.rr_fle_decrypt(e.basic_salary_enc), e.basic_salary_aed::text);
    iban_plain := coalesce(public.rr_fle_decrypt(e.iban_enc), nullif(e.iban, ''));
    -- Direct update with the trigger doing the encryption.
    update public.hr_employees
       set basic_salary_aed = salary_plain::numeric,
           iban = coalesce(iban_plain, ''),
           basic_salary_enc = null,
           iban_enc = null
     where id = e.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.rr_hr_sensitive(uuid) from public, anon;
revoke all on function public.rr_fle_reencrypt_hr() from public, anon;
grant execute on function public.rr_hr_sensitive(uuid) to authenticated;
grant execute on function public.rr_fle_reencrypt_hr() to authenticated;

------------------------------------------------------------
-- Access log: admins read; nobody writes directly
------------------------------------------------------------
alter table public.fle_access_log enable row level security;
revoke all on public.fle_access_log from anon, authenticated;
grant select on public.fle_access_log to authenticated;
drop policy if exists "Staff full access" on public.fle_access_log;
drop policy if exists "Viewers read" on public.fle_access_log;
drop policy if exists "Admins read field access log" on public.fle_access_log;
create policy "Admins read field access log" on public.fle_access_log
  for select to authenticated
  using (tenant_id = public.rr_my_tenant_id() and public.rr_is_admin());
drop policy if exists "Tenant isolation" on public.fle_access_log;
create policy "Tenant isolation" on public.fle_access_log
  as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id))
  with check (public.rr_same_tenant(tenant_id));

comment on column public.hr_employees.basic_salary_enc is 'Field-level encryption: fle:v<N>:<base64 AES-256>. Read via rr_hr_sensitive().';
comment on column public.hr_employees.iban_enc is 'Field-level encryption: fle:v<N>:<base64 AES-256>. Read via rr_hr_sensitive().';
comment on table public.fle_access_log is 'Who read encrypted fields in plain text (or got a mask).';

notify pgrst, 'reload schema';

commit;
