-- HighMast A1 (docs/DECISIONS.md D11-D13): field-level encryption, second step.
--
-- Builds on 20261222090000_field_level_encryption.sql (Vault key hm_fle_key_v<N>).
-- * Envelope: every value now gets its own random session key (OpenPGP
--   sess-key=1), wrapped by the key derived from the Vault secret. The Vault
--   secret never sits in a table row. Old ciphertexts still decrypt.
-- * New encrypted-only fields on hr_employees: Emirates ID, passport number,
--   national ID (Aadhaar / PAN / SIN / other). There is no plain column for them.
-- * Wanders passenger passport numbers and app_settings tokens / secrets get an
--   encrypted copy on every save; blanking the plain copy is opt-in per area
--   (fle.enforce.wanders, fle.enforce.settings) so live keeps working.
-- * Payroll lines keep an encrypted copy of their amounts (pay_enc).
-- * Masked by default: rr_hr_masked() returns masks only. Plain text only via
--   rr_fle_reveal(): needs the permission, is rate limited and always logged.
-- * Backfill with a dry run first, and a reverse: rr_fle_backfill(),
--   rr_fle_backfill_reverse().
-- * Audit log redacts salary, IBAN, passport and pay amounts.
--
-- Additive and safe to re-run. Not applied to live.

begin;

------------------------------------------------------------
-- Envelope encryption: random session key per value
------------------------------------------------------------
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
  execute format('select %I.pgp_sym_encrypt($1, $2, %L)', public.rr_fle_crypto_schema(),
                 'cipher-algo=aes256, sess-key=1, s2k-mode=3')
    into c using p_plain, k;
  return 'fle:v' || v || ':' || translate(encode(c, 'base64'), E'\n', '');
end;
$$;
revoke all on function public.rr_fle_encrypt(text) from public, anon, authenticated;

------------------------------------------------------------
-- Columns
------------------------------------------------------------
alter table public.fle_access_log add column if not exists reason text not null default '';
alter table public.fle_access_log add column if not exists actor_user_id uuid;
-- Widen the allowed outcomes (old values stay valid).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fle_access_log_outcome_check'
                 and pg_get_constraintdef(oid) like '%revealed%') then
    alter table public.fle_access_log drop constraint if exists fle_access_log_outcome_check;
    alter table public.fle_access_log add constraint fle_access_log_outcome_check
      check (outcome in ('plain', 'masked', 'revealed', 'denied', 'rate_limited', 'written'));
  end if;
end $$;

alter table public.hr_employees add column if not exists emirates_id_enc text;
alter table public.hr_employees add column if not exists passport_no_enc text;
alter table public.hr_employees add column if not exists national_id_enc text;
alter table public.hr_employees add column if not exists national_id_type text not null default '';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'hr_employees_national_id_type_check') then
    alter table public.hr_employees add constraint hr_employees_national_id_type_check
      check (national_id_type in ('', 'aadhaar', 'pan', 'sin', 'other'));
  end if;
end $$;

alter table public.wanders_passengers add column if not exists passport_number_enc text;
alter table public.payroll_lines add column if not exists pay_enc text;
alter table public.app_settings add column if not exists value_enc text;

comment on column public.hr_employees.emirates_id_enc is 'Encrypted only (fle:v<N>:…). Set with rr_hr_set_identity(), read with rr_fle_reveal().';
comment on column public.hr_employees.passport_no_enc is 'Encrypted only (fle:v<N>:…). Set with rr_hr_set_identity(), read with rr_fle_reveal().';
comment on column public.hr_employees.national_id_enc is 'Encrypted only: Aadhaar / PAN / SIN / other per national_id_type.';
comment on column public.wanders_passengers.passport_number_enc is 'Encrypted copy of passport_number (fle.enforce.wanders blanks the plain one).';
comment on column public.payroll_lines.pay_enc is 'Encrypted JSON copy of the line amounts.';
comment on column public.app_settings.value_enc is 'Encrypted copy of token / secret settings (fle.enforce.settings blanks value). Edge Functions read via rr_app_secret().';

------------------------------------------------------------
-- Helpers
------------------------------------------------------------
create or replace function public.rr_fle_enforced(p_area text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select value from public.app_settings where key = 'fle.enforce.' || p_area) = 'true', false)
$$;
revoke all on function public.rr_fle_enforced(text) from public, anon;
grant execute on function public.rr_fle_enforced(text) to authenticated;

-- Which app_settings keys hold secrets (same rule as the audit redaction).
create or replace function public.rr_fle_is_secret_setting(p_key text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_key, '') !~* '^fle\.'
     and (p_key ilike '%secret%' or p_key ilike '%token%' or p_key ilike '%password%'
          or p_key ilike '%apikey%' or p_key ilike '%api_key%')
$$;

create or replace function public.rr_fle_mask(p_plain text, p_kind text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_plain is null or p_plain = '' then p_plain
    when p_kind = 'iban' then left(regexp_replace(p_plain, '\s', '', 'g'), 2) || '•• •••• ' || right(regexp_replace(p_plain, '\s', '', 'g'), 4)
    when p_kind = 'id' then '•••• ' || right(regexp_replace(p_plain, '[\s-]', '', 'g'), 4)
    else '•••'
  end
$$;
grant execute on function public.rr_fle_mask(text, text) to authenticated;

-- Who may reveal a field. HR, payroll and passenger fields: manager or admin. Anything else: admin.
create or replace function public.rr_fle_can_read(p_field text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select case
    when p_field in ('hr.basic_salary', 'hr.iban', 'hr.emirates_id', 'hr.passport_no', 'hr.national_id',
                     'payroll.line', 'wanders.passport_number')
      then public.rr_is_manager_or_admin()
    else public.rr_is_admin()
  end
$$;
grant execute on function public.rr_fle_can_read(text) to authenticated;

------------------------------------------------------------
-- Encrypt on save
------------------------------------------------------------
create or replace function public.rr_fle_wanders_passengers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  enforce boolean := public.rr_fle_enforced('wanders');
begin
  if not public.rr_fle_ready() then
    if enforce and coalesce(new.passport_number, '') <> '' then
      raise exception 'Passport numbers must be encrypted, but the Vault key is not set up';
    end if;
    return new;
  end if;
  if coalesce(new.passport_number, '') <> '' then
    new.passport_number_enc := public.rr_fle_encrypt(new.passport_number);
  elsif tg_op = 'INSERT' then
    new.passport_number_enc := null;
  end if;
  if enforce then
    new.passport_number := '';
  end if;
  return new;
end;
$$;
drop trigger if exists rr_fle_wanders_passengers on public.wanders_passengers;
create trigger rr_fle_wanders_passengers
  before insert or update on public.wanders_passengers
  for each row execute function public.rr_fle_wanders_passengers();

-- Runs after rr_payroll_lines_compute (triggers fire in name order).
create or replace function public.rr_payroll_lines_fle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.rr_fle_ready() then
    new.pay_enc := public.rr_fle_encrypt(jsonb_build_object(
      'basic', new.basic_aed, 'allowances', new.allowances_aed, 'deductions', new.deductions_aed,
      'net', new.net_aed, 'gratuity', new.gratuity_accrual_aed)::text);
  end if;
  return new;
end;
$$;
drop trigger if exists rr_payroll_lines_fle on public.payroll_lines;
create trigger rr_payroll_lines_fle
  before insert or update on public.payroll_lines
  for each row execute function public.rr_payroll_lines_fle();

create or replace function public.rr_fle_app_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.rr_fle_is_secret_setting(new.key) then
    return new;
  end if;
  if not public.rr_fle_ready() then
    if public.rr_fle_enforced('settings') and coalesce(new.value, '') <> '' then
      raise exception 'Secret settings must be encrypted, but the Vault key is not set up';
    end if;
    return new;
  end if;
  if coalesce(new.value, '') <> '' then
    new.value_enc := public.rr_fle_encrypt(new.value);
  end if;
  if public.rr_fle_enforced('settings') then
    new.value := '';
  end if;
  return new;
end;
$$;
drop trigger if exists rr_fle_app_settings on public.app_settings;
create trigger rr_fle_app_settings
  before insert or update on public.app_settings
  for each row execute function public.rr_fle_app_settings();

-- Edge Functions (service role) read a secret setting here, encrypted or not.
create or replace function public.rr_app_secret(p_key text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s public.app_settings;
begin
  select * into s from public.app_settings where key = p_key;
  if not found then
    return null;
  end if;
  if s.value_enc is not null and coalesce(s.value, '') = '' then
    return public.rr_fle_decrypt(s.value_enc);
  end if;
  return s.value;
end;
$$;
revoke all on function public.rr_app_secret(text) from public, anon, authenticated;
grant execute on function public.rr_app_secret(text) to service_role;

------------------------------------------------------------
-- Identity numbers: written encrypted, never plain
------------------------------------------------------------
create or replace function public.rr_hr_set_identity(
  p_employee uuid, p_kind text, p_value text, p_national_id_type text default null)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v text := nullif(btrim(coalesce(p_value, '')), '');
begin
  if not public.rr_is_member() or not public.rr_is_manager_or_admin() then
    raise exception 'Only managers or admins can change ID numbers' using errcode = '42501';
  end if;
  if p_kind not in ('emirates_id', 'passport_no', 'national_id') then
    raise exception 'Unknown ID kind %', p_kind using errcode = '22023';
  end if;
  if v is not null and not public.rr_fle_ready() then
    raise exception 'ID numbers are stored encrypted only, and the Vault key is not set up' using errcode = '55000';
  end if;
  if v is not null and length(v) > 64 then
    raise exception 'ID number too long' using errcode = '22023';
  end if;
  if not exists (select 1 from public.hr_employees where id = p_employee and tenant_id = public.rr_my_tenant_id()) then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;
  execute format('update public.hr_employees set %I = $1, updated_at = now() where id = $2', p_kind || '_enc')
    using case when v is null then null else public.rr_fle_encrypt(v) end, p_employee;
  if p_kind = 'national_id' and p_national_id_type is not null then
    update public.hr_employees set national_id_type = p_national_id_type where id = p_employee;
  end if;
  insert into public.fle_access_log (tenant_id, field_key, row_id, actor_email, actor_user_id, outcome, reason)
  values (public.rr_my_tenant_id(), 'hr.' || p_kind, p_employee::text, coalesce(public.rr_current_email(), ''),
          public.rr_current_user_id(), 'written', '');
end;
$$;
revoke all on function public.rr_hr_set_identity(uuid, text, text, text) from public, anon;
grant execute on function public.rr_hr_set_identity(uuid, text, text, text) to authenticated;

------------------------------------------------------------
-- Masked by default
------------------------------------------------------------
create or replace function public.rr_hr_masked(p_employee uuid)
returns table (employee_id uuid, basic_salary text, iban text, emirates_id text, passport_no text,
               national_id text, national_id_type text, encrypted boolean)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  r public.hr_employees;
begin
  if not public.rr_is_member() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into r from public.hr_employees e where e.id = p_employee and e.tenant_id = public.rr_my_tenant_id();
  if not found then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;
  return query select r.id,
    case when r.basic_salary_enc is not null or r.basic_salary_aed is not null then '•••' else '' end,
    case when r.iban_enc is not null then public.rr_fle_mask(public.rr_fle_decrypt(r.iban_enc), 'iban')
         else public.rr_fle_mask(nullif(r.iban, ''), 'iban') end,
    case when r.emirates_id_enc is not null then public.rr_fle_mask(public.rr_fle_decrypt(r.emirates_id_enc), 'id') else '' end,
    case when r.passport_no_enc is not null then public.rr_fle_mask(public.rr_fle_decrypt(r.passport_no_enc), 'id') else '' end,
    case when r.national_id_enc is not null then public.rr_fle_mask(public.rr_fle_decrypt(r.national_id_enc), 'id') else '' end,
    r.national_id_type,
    r.basic_salary_enc is not null or r.iban_enc is not null;
end;
$$;
revoke all on function public.rr_hr_masked(uuid) from public, anon;
grant execute on function public.rr_hr_masked(uuid) to authenticated;

------------------------------------------------------------
-- Reveal: permission + rate limit + audit entry, every time
------------------------------------------------------------
create or replace function public.rr_fle_reveal(p_field text, p_row_id uuid, p_reason text default '')
returns table (value text, masked boolean, outcome text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  tenant uuid := public.rr_my_tenant_id();
  plain text;
  kind text := 'secret';
  found_row boolean := false;
  lim int := coalesce(nullif((select s.value from public.app_settings s where s.key = 'fle.reveal_limit_per_10min'), '')::int, 20);
  result text;
  e public.hr_employees;
  wp public.wanders_passengers;
  pl public.payroll_lines;
begin
  if not public.rr_is_member() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  if p_field not in ('hr.basic_salary', 'hr.iban', 'hr.emirates_id', 'hr.passport_no', 'hr.national_id',
                     'wanders.passport_number', 'payroll.line') then
    raise exception 'Unknown field %', p_field using errcode = '22023';
  end if;

  if p_field like 'hr.%' then
    select * into e from public.hr_employees h where h.id = p_row_id and h.tenant_id = tenant;
    found_row := found;
    if found_row then
      plain := case p_field
        when 'hr.basic_salary' then coalesce(public.rr_fle_decrypt(e.basic_salary_enc), e.basic_salary_aed::text)
        when 'hr.iban' then coalesce(public.rr_fle_decrypt(e.iban_enc), nullif(e.iban, ''))
        when 'hr.emirates_id' then public.rr_fle_decrypt(e.emirates_id_enc)
        when 'hr.passport_no' then public.rr_fle_decrypt(e.passport_no_enc)
        when 'hr.national_id' then public.rr_fle_decrypt(e.national_id_enc)
      end;
      kind := case when p_field = 'hr.iban' then 'iban' when p_field = 'hr.basic_salary' then 'secret' else 'id' end;
    end if;
  elsif p_field = 'wanders.passport_number' then
    select * into wp from public.wanders_passengers w where w.id = p_row_id and w.tenant_id = tenant;
    found_row := found;
    plain := coalesce(public.rr_fle_decrypt(wp.passport_number_enc), nullif(wp.passport_number, ''));
    kind := 'id';
  elsif p_field = 'payroll.line' then
    select * into pl from public.payroll_lines l where l.id = p_row_id and l.tenant_id = tenant;
    found_row := found;
    plain := coalesce(public.rr_fle_decrypt(pl.pay_enc), jsonb_build_object(
      'basic', pl.basic_aed, 'allowances', pl.allowances_aed, 'deductions', pl.deductions_aed,
      'net', pl.net_aed, 'gratuity', pl.gratuity_accrual_aed)::text);
  else
    raise exception 'Unknown field %', p_field using errcode = '22023';
  end if;

  if not found_row then
    raise exception 'Record not found' using errcode = 'P0002';
  end if;

  if not public.rr_fle_can_read(p_field) then
    result := 'denied';
  elsif not public.rr_rate_limit_hit('fle.reveal:' || coalesce(public.rr_current_user_id()::text, 'anon'), greatest(lim, 1), 600) then
    result := 'rate_limited';
  else
    result := 'revealed';
  end if;

  insert into public.fle_access_log (tenant_id, field_key, row_id, actor_email, actor_user_id, outcome, reason)
  values (tenant, p_field, p_row_id::text, coalesce(public.rr_current_email(), ''), public.rr_current_user_id(),
          result, left(coalesce(p_reason, ''), 200));

  if result = 'revealed' then
    return query select plain, false, result;
  else
    return query select public.rr_fle_mask(plain, kind), true, result;
  end if;
end;
$$;
revoke all on function public.rr_fle_reveal(text, uuid, text) from public, anon;
grant execute on function public.rr_fle_reveal(text, uuid, text) to authenticated;

------------------------------------------------------------
-- Backfill (dry run first) and its reverse
------------------------------------------------------------
create or replace function public.rr_fle_backfill(p_scope text, p_dry_run boolean default true)
returns table (scope text, rows_total int, rows_needing_encryption int, rows_changed int, dry_run boolean)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  total int := 0;
  needing int := 0;
  changed int := 0;
begin
  if auth.uid() is not null and not public.rr_is_admin() then
    raise exception 'Only an admin can run the encryption backfill' using errcode = '42501';
  end if;
  if not p_dry_run and not public.rr_fle_ready() then
    raise exception 'Vault key hm_fle_key_v% is not set up', public.rr_fle_current_version();
  end if;

  if p_scope = 'hr' then
    select count(*), count(*) filter (where (basic_salary_aed is not null and basic_salary_enc is null)
                                         or (coalesce(iban, '') <> '' and iban_enc is null))
      into total, needing
      from public.hr_employees where auth.uid() is null or tenant_id = public.rr_my_tenant_id();
    if not p_dry_run then
      -- The save trigger encrypts (and blanks plain when fle.enforce.hr is on).
      update public.hr_employees set updated_at = updated_at
       where (auth.uid() is null or tenant_id = public.rr_my_tenant_id())
         and ((basic_salary_aed is not null) or coalesce(iban, '') <> '');
      get diagnostics changed = row_count;
    end if;
  elsif p_scope = 'wanders' then
    select count(*), count(*) filter (where coalesce(passport_number, '') <> '' and passport_number_enc is null)
      into total, needing
      from public.wanders_passengers where auth.uid() is null or tenant_id = public.rr_my_tenant_id();
    if not p_dry_run then
      update public.wanders_passengers set passport_number = passport_number
       where (auth.uid() is null or tenant_id = public.rr_my_tenant_id()) and coalesce(passport_number, '') <> '';
      get diagnostics changed = row_count;
    end if;
  elsif p_scope = 'payroll' then
    select count(*), count(*) filter (where pay_enc is null) into total, needing
      from public.payroll_lines where auth.uid() is null or tenant_id = public.rr_my_tenant_id();
    if not p_dry_run then
      update public.payroll_lines set basic_aed = basic_aed
       where (auth.uid() is null or tenant_id = public.rr_my_tenant_id()) and pay_enc is null;
      get diagnostics changed = row_count;
    end if;
  elsif p_scope = 'settings' then
    select count(*), count(*) filter (where coalesce(value, '') <> '' and value_enc is null) into total, needing
      from public.app_settings where public.rr_fle_is_secret_setting(key);
    if auth.uid() is not null and not p_dry_run then
      raise exception 'Secret settings are backfilled by the service role only' using errcode = '42501';
    end if;
    if not p_dry_run then
      update public.app_settings set value = value where public.rr_fle_is_secret_setting(key) and coalesce(value, '') <> '';
      get diagnostics changed = row_count;
    end if;
  else
    raise exception 'Unknown scope % (use hr, wanders, payroll, settings)', p_scope using errcode = '22023';
  end if;
  return query select p_scope, total, needing, changed, p_dry_run;
end;
$$;

-- Put plain values back from the encrypted copies (for example before rolling
-- back the app). Refuses while enforcement is on, because saving would blank them again.
create or replace function public.rr_fle_backfill_reverse(p_scope text, p_dry_run boolean default true)
returns table (scope text, rows_to_restore int, rows_changed int, dry_run boolean)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  needing int := 0;
  changed int := 0;
begin
  if auth.uid() is not null and not public.rr_is_admin() then
    raise exception 'Only an admin can reverse the encryption backfill' using errcode = '42501';
  end if;
  if p_scope not in ('hr', 'wanders', 'settings') then
    raise exception 'Unknown scope % (use hr, wanders, settings)', p_scope using errcode = '22023';
  end if;
  if not p_dry_run and public.rr_fle_enforced(p_scope) then
    raise exception 'Turn off fle.enforce.% first', p_scope using errcode = '55000';
  end if;
  if p_scope = 'hr' then
    select count(*) into needing from public.hr_employees
     where (auth.uid() is null or tenant_id = public.rr_my_tenant_id())
       and ((basic_salary_aed is null and basic_salary_enc is not null) or (coalesce(iban, '') = '' and iban_enc is not null));
    if not p_dry_run then
      update public.hr_employees
         set basic_salary_aed = coalesce(basic_salary_aed, public.rr_fle_decrypt(basic_salary_enc)::numeric),
             iban = coalesce(nullif(iban, ''), public.rr_fle_decrypt(iban_enc), '')
       where (auth.uid() is null or tenant_id = public.rr_my_tenant_id())
         and ((basic_salary_aed is null and basic_salary_enc is not null) or (coalesce(iban, '') = '' and iban_enc is not null));
      get diagnostics changed = row_count;
    end if;
  elsif p_scope = 'wanders' then
    select count(*) into needing from public.wanders_passengers
     where (auth.uid() is null or tenant_id = public.rr_my_tenant_id())
       and coalesce(passport_number, '') = '' and passport_number_enc is not null;
    if not p_dry_run then
      update public.wanders_passengers set passport_number = public.rr_fle_decrypt(passport_number_enc)
       where (auth.uid() is null or tenant_id = public.rr_my_tenant_id())
         and coalesce(passport_number, '') = '' and passport_number_enc is not null;
      get diagnostics changed = row_count;
    end if;
  else
    if auth.uid() is not null then
      raise exception 'Secret settings are restored by the service role only' using errcode = '42501';
    end if;
    select count(*) into needing from public.app_settings
     where public.rr_fle_is_secret_setting(key) and coalesce(value, '') = '' and value_enc is not null;
    if not p_dry_run then
      update public.app_settings set value = public.rr_fle_decrypt(value_enc)
       where public.rr_fle_is_secret_setting(key) and coalesce(value, '') = '' and value_enc is not null;
      get diagnostics changed = row_count;
    end if;
  end if;
  return query select p_scope, needing, changed, p_dry_run;
end;
$$;

revoke all on function public.rr_fle_backfill(text, boolean) from public, anon;
revoke all on function public.rr_fle_backfill_reverse(text, boolean) from public, anon;
grant execute on function public.rr_fle_backfill(text, boolean) to authenticated;
grant execute on function public.rr_fle_backfill_reverse(text, boolean) to authenticated;

------------------------------------------------------------
-- Audit log never stores salary, IBAN, passport or pay amounts
------------------------------------------------------------
create or replace function public.rr_audit_redact(tbl text, data jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when data is null then null
    when tbl = 'app_settings'
      and (data->>'key' ilike '%secret%' or data->>'key' ilike '%token%'
           or data->>'key' ilike '%password%' or data->>'key' ilike '%apikey%' or data->>'key' ilike '%api_key%')
      then jsonb_set(data, '{value}', '"[redacted]"')
    when tbl = 'hr_employees'
      then data - array['basic_salary_aed', 'iban', 'allowances_aed', 'bank_routing_code', 'labour_card_no']
    when tbl = 'payroll_lines'
      then data - array['basic_aed', 'allowances_aed', 'deductions_aed', 'net_aed', 'gratuity_accrual_aed']
    when tbl = 'wanders_passengers'
      then data - array['passport_number']
    else data
  end
$$;

notify pgrst, 'reload schema';

commit;
