-- HighMast A1 (docs/DECISIONS.md D9, D10): exact money in SQL and trusted
-- payroll / ledger logic in the database instead of the browser.
--
-- * rr_currency_decimals / rr_money_round: per-currency rounding (JPY 0,
--   AED 2, KWD 3), half away from zero, matching app/src/lib/money.
-- * payroll_lines amounts widen from numeric(14,2) to numeric(18,3) so
--   3-decimal currencies fit. Widening keeps every stored value unchanged.
-- * Payroll: net pay is always recomputed by the database on every save
--   (a browser cannot store a wrong net). rr_payroll_generate_lines,
--   rr_payroll_update_line and rr_payroll_run_totals do the maths server side,
--   reading salaries through field-level encryption when it is set up.
-- * Ledger: a journal can become 'posted' only inside rr_gl_post_journal.
--
-- Additive and safe to re-run. Not applied to live (Alfred applies via the SQL copy page).

begin;

------------------------------------------------------------
-- Money helpers
------------------------------------------------------------
create or replace function public.rr_currency_decimals(p_currency text)
returns int
language sql
immutable
set search_path = public
as $$
  select case
    when upper(btrim(coalesce(p_currency, ''))) in
      ('BIF','CLP','DJF','GNF','ISK','JPY','KMF','KRW','PYG','RWF','UGX','VND','VUV','XAF','XOF','XPF') then 0
    when upper(btrim(coalesce(p_currency, ''))) in ('BHD','IQD','JOD','KWD','LYD','OMR','TND') then 3
    else 2
  end
$$;

create or replace function public.rr_money_round(p_amount numeric, p_currency text)
returns numeric
language sql
immutable
set search_path = public
as $$
  select round(coalesce(p_amount, 0), public.rr_currency_decimals(p_currency))
$$;

grant execute on function public.rr_currency_decimals(text) to authenticated, service_role;
grant execute on function public.rr_money_round(numeric, text) to authenticated, service_role;

------------------------------------------------------------
-- payroll_lines: room for 3-decimal currencies (widening only)
------------------------------------------------------------
do $$
begin
  if (select numeric_scale from information_schema.columns
      where table_schema = 'public' and table_name = 'payroll_lines' and column_name = 'net_aed') < 3 then
    alter table public.payroll_lines
      alter column basic_aed type numeric(18, 3),
      alter column allowances_aed type numeric(18, 3),
      alter column deductions_aed type numeric(18, 3),
      alter column net_aed type numeric(18, 3),
      alter column gratuity_accrual_aed type numeric(18, 3);
  end if;
end $$;

------------------------------------------------------------
-- Payroll maths (same rules as app/src/lib/wpsGratuity.ts)
------------------------------------------------------------
create or replace function public.rr_payroll_net(p_basic numeric, p_allowances numeric, p_deductions numeric, p_currency text)
returns numeric
language sql
immutable
set search_path = public
as $$
  select greatest(0,
    public.rr_money_round(p_basic, p_currency)
    + public.rr_money_round(p_allowances, p_currency)
    - public.rr_money_round(p_deductions, p_currency))
$$;

-- Draft gratuity accrual for planning (not legal advice): 21 days a year for
-- the first 5 years, 30 after; daily wage = basic / 30 rounded to the currency.
create or replace function public.rr_payroll_gratuity_draft(p_basic numeric, p_start date, p_as_of date, p_currency text)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  years int;
  daily numeric;
  days int;
begin
  if p_start is null or p_as_of is null or p_as_of < p_start then
    return 0;
  end if;
  years := floor((p_as_of - p_start)::numeric / 365.25);
  daily := public.rr_money_round(greatest(0, coalesce(p_basic, 0)) / 30, p_currency);
  if years <= 0 or daily <= 0 then
    return 0;
  end if;
  days := least(years, 5) * 21 + greatest(years - 5, 0) * 30;
  return public.rr_money_round(days * daily, p_currency);
end;
$$;

grant execute on function public.rr_payroll_net(numeric, numeric, numeric, text) to authenticated, service_role;
grant execute on function public.rr_payroll_gratuity_draft(numeric, date, date, text) to authenticated, service_role;

-- Every save: round amounts to the run currency and recompute net pay.
create or replace function public.rr_payroll_lines_compute()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cur text;
begin
  select coalesce(nullif(r.currency, ''), 'AED') into cur from public.payroll_runs r where r.id = new.run_id;
  cur := coalesce(cur, 'AED');
  new.basic_aed := public.rr_money_round(new.basic_aed, cur);
  new.allowances_aed := public.rr_money_round(new.allowances_aed, cur);
  new.deductions_aed := public.rr_money_round(new.deductions_aed, cur);
  new.gratuity_accrual_aed := public.rr_money_round(new.gratuity_accrual_aed, cur);
  new.net_aed := public.rr_payroll_net(new.basic_aed, new.allowances_aed, new.deductions_aed, cur);
  return new;
end;
$$;

drop trigger if exists rr_payroll_lines_compute on public.payroll_lines;
create trigger rr_payroll_lines_compute
  before insert or update on public.payroll_lines
  for each row execute function public.rr_payroll_lines_compute();

-- Salary for payroll: decrypted when field-level encryption holds it, else the plain column.
create or replace function public.rr_payroll_salary_of(e public.hr_employees)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if e.basic_salary_enc is not null then
    return public.rr_fle_decrypt(e.basic_salary_enc)::numeric;
  end if;
  return e.basic_salary_aed;
end;
$$;
revoke all on function public.rr_payroll_salary_of(public.hr_employees) from public, anon, authenticated;

create or replace function public.rr_payroll_iban_present(e public.hr_employees)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(e.iban, '') <> '' or e.iban_enc is not null
$$;
revoke all on function public.rr_payroll_iban_present(public.hr_employees) from public, anon, authenticated;

create or replace function public.rr_payroll_run_for_write(p_run uuid)
returns public.payroll_runs
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  r public.payroll_runs;
begin
  if not public.rr_is_member() or not public.rr_is_manager_or_admin() then
    raise exception 'Only managers or admins can calculate payroll' using errcode = '42501';
  end if;
  select * into r from public.payroll_runs where id = p_run and tenant_id = public.rr_my_tenant_id();
  if not found then
    raise exception 'Payroll run not found' using errcode = 'P0002';
  end if;
  if r.status <> 'draft' then
    raise exception 'Only draft payroll runs can be recalculated' using errcode = '22023';
  end if;
  return r;
end;
$$;
revoke all on function public.rr_payroll_run_for_write(uuid) from public, anon, authenticated;

-- Server side replacement for generatePayrollLinesFromHr() in the browser.
create or replace function public.rr_payroll_generate_lines(p_run uuid)
returns int
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  r public.payroll_runs := public.rr_payroll_run_for_write(p_run);
  e public.hr_employees;
  cur text := coalesce(nullif(r.currency, ''), 'AED');
  basic numeric;
  allowances numeric;
  net numeric;
  n int := 0;
begin
  for e in
    select * from public.hr_employees h
    where h.tenant_id = r.tenant_id and h.employment_status = 'active' and h.deleted_at is null
    order by h.full_name
  loop
    basic := public.rr_money_round(coalesce(public.rr_payroll_salary_of(e), 0), cur);
    allowances := public.rr_money_round(coalesce(e.allowances_aed, 0), cur);
    net := public.rr_payroll_net(basic, allowances, 0, cur);
    insert into public.payroll_lines as pl
      (tenant_id, run_id, employee_id, basic_aed, allowances_aed, deductions_aed, net_aed, gratuity_accrual_aed, wps_ready)
    values (
      r.tenant_id, r.id, e.id, basic, allowances, 0, net,
      public.rr_payroll_gratuity_draft(basic, e.start_date, current_date, cur),
      public.rr_payroll_iban_present(e) and coalesce(e.labour_card_no, '') <> '' and coalesce(e.bank_routing_code, '') <> '' and net > 0)
    on conflict (run_id, employee_id) do update
      set basic_aed = excluded.basic_aed,
          allowances_aed = excluded.allowances_aed,
          deductions_aed = excluded.deductions_aed,
          net_aed = excluded.net_aed,
          gratuity_accrual_aed = excluded.gratuity_accrual_aed,
          wps_ready = excluded.wps_ready;
    n := n + 1;
  end loop;
  update public.payroll_runs set updated_at = now() where id = r.id;
  return n;
end;
$$;

-- Server side replacement for updatePayrollLine(). Null keeps the stored value.
create or replace function public.rr_payroll_update_line(
  p_line uuid, p_basic numeric default null, p_allowances numeric default null, p_deductions numeric default null)
returns public.payroll_lines
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  l public.payroll_lines;
  e public.hr_employees;
begin
  select * into l from public.payroll_lines where id = p_line and tenant_id = public.rr_my_tenant_id();
  if not found then
    raise exception 'Payroll line not found' using errcode = 'P0002';
  end if;
  perform public.rr_payroll_run_for_write(l.run_id);
  select * into e from public.hr_employees where id = l.employee_id;
  update public.payroll_lines
     set basic_aed = coalesce(p_basic, basic_aed),
         allowances_aed = coalesce(p_allowances, allowances_aed),
         deductions_aed = coalesce(p_deductions, deductions_aed)
   where id = p_line
  returning * into l;
  update public.payroll_lines
     set wps_ready = public.rr_payroll_iban_present(e) and coalesce(e.labour_card_no, '') <> ''
                     and coalesce(e.bank_routing_code, '') <> '' and l.net_aed > 0
   where id = p_line
  returning * into l;
  return l;
end;
$$;

-- Exact run totals (sums in numeric, no float).
create or replace function public.rr_payroll_run_totals(p_run uuid)
returns table (currency text, line_count int, total_basic numeric, total_allowances numeric,
               total_deductions numeric, total_net numeric, total_gratuity numeric)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.rr_is_member() or not public.rr_is_manager_or_admin() then
    raise exception 'Only managers or admins can see payroll totals' using errcode = '42501';
  end if;
  return query
    select coalesce(nullif(r.currency, ''), 'AED'), count(l.id)::int,
           coalesce(sum(l.basic_aed), 0), coalesce(sum(l.allowances_aed), 0), coalesce(sum(l.deductions_aed), 0),
           coalesce(sum(l.net_aed), 0), coalesce(sum(l.gratuity_accrual_aed), 0)
    from public.payroll_runs r
    left join public.payroll_lines l on l.run_id = r.id
    where r.id = p_run and r.tenant_id = public.rr_my_tenant_id()
    group by r.currency;
end;
$$;

revoke all on function public.rr_payroll_generate_lines(uuid) from public, anon;
revoke all on function public.rr_payroll_update_line(uuid, numeric, numeric, numeric) from public, anon;
revoke all on function public.rr_payroll_run_totals(uuid) from public, anon;
grant execute on function public.rr_payroll_generate_lines(uuid) to authenticated;
grant execute on function public.rr_payroll_update_line(uuid, numeric, numeric, numeric) to authenticated;
grant execute on function public.rr_payroll_run_totals(uuid) to authenticated;

------------------------------------------------------------
-- Ledger: posting only through rr_gl_post_journal
------------------------------------------------------------
create or replace function public.rr_gl_post_journal(p_journal uuid)
returns public.gl_journals
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.gl_journals;
begin
  select * into j from public.gl_journals where id = p_journal for update;
  if not found then
    raise exception 'Journal not found';
  end if;
  if j.tenant_id is distinct from public.rr_my_tenant_id() then
    raise exception 'Wrong tenant';
  end if;
  if not public.rr_is_manager_or_admin() then
    raise exception 'Only managers or admins can post journals';
  end if;
  if j.status <> 'draft' then
    raise exception 'Only draft journals can be posted';
  end if;
  if not public.rr_gl_journal_balanced(p_journal) then
    raise exception 'Journal is not balanced (debits must equal credits and be > 0)';
  end if;
  perform set_config('rr.gl_posting', 'on', true);
  update public.gl_journals
    set status = 'posted',
        posted_at = now(),
        posted_by = public.rr_current_user_id(),
        updated_at = now()
    where id = p_journal
    returning * into j;
  perform set_config('rr.gl_posting', 'off', true);
  return j;
end;
$$;

create or replace function public.rr_gl_posting_guard()
returns trigger
language plpgsql
set search_path = public, auth
as $$
begin
  if new.status = 'posted'
     and (tg_op = 'INSERT' or old.status is distinct from 'posted')
     and auth.uid() is not null
     and coalesce(current_setting('rr.gl_posting', true), '') <> 'on' then
    raise exception 'Journals are posted only through rr_gl_post_journal (balance and role checked in the database)'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists rr_gl_posting_guard on public.gl_journals;
create trigger rr_gl_posting_guard
  before insert or update on public.gl_journals
  for each row execute function public.rr_gl_posting_guard();

notify pgrst, 'reload schema';

commit;
