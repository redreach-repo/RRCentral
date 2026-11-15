-- Demo seed pack (gap plan module 4, docs/modules/demo-isolation.md).
-- Fictional companies and people only: no Red Reach clients, no Tee Tribe,
-- no real brands. Run ONLY in the separate demo Supabase project, after all
-- migrations, from that project's SQL editor.
--
-- Safety: refuses to run (and changes nothing) unless
--   1. the session sets: set app.demo_seed = 'yes';
--   2. the database has no invoices or quotations yet (a fresh demo DB).
-- A live database always has invoices, so this cannot run there by mistake.
-- Safe to re-run on the demo DB only before any invoice exists; after that
-- use demo_reset.sql (also gated) to wipe demo rows and re-seed.

do $$
declare
  tid uuid := 'a0000000-0000-4000-8000-000000000001';
  n int;
begin
  if coalesce(current_setting('app.demo_seed', true), '') <> 'yes' then
    raise exception 'DEMO SEED REFUSED: run "set app.demo_seed = ''yes'';" first, and only in the demo project';
  end if;
  select (select count(*) from public.invoices) + (select count(*) from public.quotations) into n;
  if n > 0 then
    raise exception 'DEMO SEED REFUSED: this database already has % invoices/quotations. It looks like a real database.', n;
  end if;

  update public.tenants
    set name = 'Falcon Bay Trading (demo)', slug = 'falcon-bay-demo', is_demo = true
    where id = tid;

  -- Demo brand kit (HighMast tokens; no Red Reach logo paths).
  update public.brand_kits
    set primary_color = '#C8321A',
        accent_color = '#E8872A',
        neutral_dark = '#1A1A1A',
        neutral_light = '#F7F4F1',
        legal_footer = 'Falcon Bay Trading (demo) — fictional data only. Powered by HighMast.',
        logo_horizontal_path = null,
        logo_light_path = null,
        mark_square_path = null,
        updated_at = now()
    where tenant_id = tid and company_id is null and business_unit_id is null;
  if not found then
    insert into public.brand_kits (
      id, tenant_id, primary_color, accent_color, neutral_dark, neutral_light, legal_footer
    ) values (
      'd0000000-0000-4000-8000-000000000001',
      tid,
      '#C8321A',
      '#E8872A',
      '#1A1A1A',
      '#F7F4F1',
      'Falcon Bay Trading (demo) — fictional data only. Powered by HighMast.'
    );
  end if;

  insert into public.accounts (id, type, name, reference, industry, country, city, website, status, source) values
    ('d1000000-0000-4000-8000-000000000001', 'rr_trading_client', 'Sandstone Logistics LLC', 'AC-DEMO-001', 'Logistics', 'UAE', 'Dubai', 'https://sandstone-logistics.example', 'active', 'demo'),
    ('d1000000-0000-4000-8000-000000000002', 'ai_crm_client', 'Pearl Coast Foods', 'AC-DEMO-002', 'Food distribution', 'UAE', 'Sharjah', 'https://pearlcoast.example', 'active', 'demo'),
    ('d1000000-0000-4000-8000-000000000003', 'rr_marketing_client', 'Oasis Fit Studios', 'AC-DEMO-003', 'Fitness', 'UAE', 'Abu Dhabi', 'https://oasisfit.example', 'active', 'demo'),
    ('d1000000-0000-4000-8000-000000000004', 'ctrm_prospect', 'Harbor Light Metals', 'AC-DEMO-004', 'Metals trading', 'Oman', 'Muscat', 'https://harborlight.example', 'prospect', 'demo')
  on conflict (id) do nothing;

  insert into public.account_contacts (id, account_id, name, role, email, phone, is_primary) values
    ('d1100000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'Maya Haddad', 'Ops lead', 'maya@sandstone-logistics.example', '+971500000001', true),
    ('d1100000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', 'Omar Siddiqui', 'Sales director', 'omar@pearlcoast.example', '+971500000002', true),
    ('d1100000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000003', 'Noor Al Mazrouei', 'Owner', 'noor@oasisfit.example', '+971500000003', true),
    ('d1100000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000004', 'Lina Farouk', 'Buyer', 'lina@harborlight.example', '+96890000004', true)
  on conflict (id) do nothing;

  insert into public.crm (id, company_name, primary_contact, email_phone, notes, next_action, pipeline_stage, account_id) values
    ('d2000000-0000-4000-8000-000000000001', 'Sandstone Logistics LLC', 'Maya Haddad', 'maya@sandstone-logistics.example', 'Wants tracking portal for 40 trucks.', 'Send revised quote', 'Quote sent', 'd1000000-0000-4000-8000-000000000001'),
    ('d2000000-0000-4000-8000-000000000002', 'Pearl Coast Foods', 'Omar Siddiqui', 'omar@pearlcoast.example', 'AI CRM pilot for 6 sales reps.', 'Book demo', 'Lead', 'd1000000-0000-4000-8000-000000000002'),
    ('d2000000-0000-4000-8000-000000000003', 'Harbor Light Metals', 'Lina Farouk', 'lina@harborlight.example', 'Evaluating CTRM options.', 'Intro call', 'Lead', 'd1000000-0000-4000-8000-000000000004')
  on conflict (id) do nothing;

  -- Lead → discovery story on Pearl Coast (sales board).
  insert into public.sales_deals (
    id, account_id, stage, source, next_action, next_action_date,
    notes, monthly_fee, setup_fee, quote_reference, created_by
  ) values (
    'd2100000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000002',
    'discovery_call',
    'demo',
    'Book product demo',
    current_date + 3,
    'Pilot for 6 reps. Fictional deal for guided tour.',
    2500,
    5000,
    'DEMO-Q-PEARL',
    'demo-seed'
  )
  on conflict (id) do nothing;

  insert into public.quotations (id, client, reference_number, date, description, amount, currency, status, account_id) values
    ('d3000000-0000-4000-8000-000000000001', 'Sandstone Logistics LLC', 'DEMO-Q-0001', current_date - 10, 'Fleet tracking portal, setup and first year', 48000, 'AED', 'sent', 'd1000000-0000-4000-8000-000000000001'),
    ('d3000000-0000-4000-8000-000000000002', 'Oasis Fit Studios', 'DEMO-Q-0002', current_date - 40, 'Social media retainer, 3 months', 13500, 'AED', 'accepted', 'd1000000-0000-4000-8000-000000000003')
  on conflict (id) do nothing;

  insert into public.invoices (id, client, reference_number, date, description, amount, currency, status, payment_status, account_id) values
    ('d4000000-0000-4000-8000-000000000001', 'Oasis Fit Studios', 'DEMO-I-0001', current_date - 30, 'Social media retainer, month 1', 4500, 'AED', 'sent', 'paid', 'd1000000-0000-4000-8000-000000000003'),
    ('d4000000-0000-4000-8000-000000000002', 'Oasis Fit Studios', 'DEMO-I-0002', current_date - 2, 'Social media retainer, month 2', 4500, 'AED', 'sent', 'unpaid', 'd1000000-0000-4000-8000-000000000003')
  on conflict (id) do nothing;

  raise notice 'Demo seed loaded: Falcon Bay brand kit, 4 accounts, 4 contacts, 3 leads, 1 sales deal, 2 quotations, 2 invoices (all fictional).';
end $$;
