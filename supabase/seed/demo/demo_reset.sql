-- Presenter reset for the Falcon Bay demo project (M3a).
-- Deletes only demo-prefixed rows, then re-applies demo_seed.sql.
--
-- Safety: refuses unless
--   1. set app.demo_seed = 'yes';
--   2. the Red Reach default tenant row is marked is_demo = true
--      (demo_seed renames it to Falcon Bay). Never run on live.
--
-- Usage (demo SQL editor only):
--   set app.demo_seed = 'yes';
--   \i seed/demo/demo_reset.sql

do $$
declare
  tid uuid := 'a0000000-0000-4000-8000-000000000001';
  demo boolean;
begin
  if coalesce(current_setting('app.demo_seed', true), '') <> 'yes' then
    raise exception 'DEMO RESET REFUSED: run "set app.demo_seed = ''yes'';" first';
  end if;
  select coalesce(is_demo, false) into demo from public.tenants where id = tid;
  if not coalesce(demo, false) then
    raise exception 'DEMO RESET REFUSED: tenant % is not is_demo. Refusing to wipe.', tid;
  end if;

  delete from public.invoices where id::text like 'd4%';
  delete from public.quotations where id::text like 'd3%';
  delete from public.sales_deals where id::text like 'd21%';
  delete from public.crm where id::text like 'd2%';
  delete from public.account_contacts where id::text like 'd11%';
  delete from public.accounts where id::text like 'd1%' and source = 'demo';
  delete from public.brand_kits where id::text like 'd0%';

  raise notice 'Demo rows cleared. Re-run demo_seed.sql next (same session flag).';
end $$;

\ir demo_seed.sql
