begin;

-- RR Central roadmap item 11: audit log for contracts, prices and commission.
--
-- The audit trail (20260926080000_audit_log.sql) already records every
-- create, change and delete on contracts, packages, rates, commission and
-- the other key records, with who did it and the before and after values.
-- This closes the gaps on prices:
--
-- 1. Adds the audit trigger to the price tables that had none: quote and
--    invoice lines, Wanders tour packages, their costs and selling prices,
--    departures, partners and exchange rates.
-- 2. Keeps the account each audit row belongs to in its own column, so a
--    client's full history (contract, invoices, hours, deals) loads quickly.
--
-- Admins read the log; nobody can change or delete it from the app.
-- Changes no existing data. Safe to re-run.
--
-- To reverse:
--   drop trigger if exists rr_audit on each table listed below;
--   drop index if exists public.idx_audit_log_account;
--   alter table public.audit_log drop column if exists account_id;

do $$
declare
  t text;
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rr_audit_trigger'
  ) then
    raise notice 'rr_audit_trigger missing, run 20260926080000_audit_log.sql first';
    return;
  end if;
  foreach t in array array[
    'line_items', 'tour_packages', 'package_cost_components', 'package_selling_prices',
    'scheduled_departures', 'wanders_partners', 'fx_rates'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists rr_audit on public.%I', t);
      execute format(
        'create trigger rr_audit after insert or update or delete on public.%I
           for each row execute function public.rr_audit_trigger()', t);
    end if;
  end loop;
end $$;

alter table public.audit_log
  add column if not exists account_id text
  generated always as (coalesce(new_data->>'account_id', old_data->>'account_id')) stored;
create index if not exists idx_audit_log_account
  on public.audit_log (account_id, created_at desc) where account_id is not null;

notify pgrst, 'reload schema';

commit;
