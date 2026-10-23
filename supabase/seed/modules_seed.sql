-- RR Central modules: test data. NEVER run this on production.
--
-- For a staging or local Supabase project with all migrations applied.
-- It refuses to run unless you first type, in the same SQL editor run:
--
--   set rr.seed = 'not-production';
--
-- and it also refuses on any database that already has invoices or
-- quotations, since that looks like production.
--
-- Adds:
-- * one user per role (admin, manager, sales, staff, viewer) at @seed.redreach.test.
--   These are app_users rows only. To sign in as one, also create the auth user
--   with the same email in Authentication.
-- * 3 AI CRM clients, one per package, with contracts, hours and usage.
--   Gulf Smile Dental (Growth) is over its hours target two months running.
-- * 2 WorshipHub churches, icoc-uae and icoc-abu-dhabi.
-- * 5 CTRM Next prospects across stages, two of them stale.
-- * 12 tickets across all account types, two close to their reply time.
--
-- Every row uses an id starting with eeeeeeee so it can be removed again:
-- see the end of this file. Safe to re-run (it skips rows already there).
-- One transaction: if the guard stops it, nothing is added.

begin;

do $$
begin
  if coalesce(current_setting('rr.seed', true), '') <> 'not-production' then
    raise exception 'Not seeding. Run  set rr.seed = ''not-production'';  first, and never on production.';
  end if;
  if exists (select 1 from public.invoices) or exists (select 1 from public.quotations) then
    raise exception 'Not seeding. This database has invoices or quotations, so it looks like production.';
  end if;
end $$;

-- Users, one per role
insert into public.app_users (id, email, name, role) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'admin@seed.redreach.test', 'Seed Admin', 'admin'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'manager@seed.redreach.test', 'Seed Manager', 'manager'),
  ('eeeeeeee-0000-0000-0000-000000000003', 'sales@seed.redreach.test', 'Seed Sales', 'sales'),
  ('eeeeeeee-0000-0000-0000-000000000004', 'va@seed.redreach.test', 'Seed VA', 'staff'),
  ('eeeeeeee-0000-0000-0000-000000000005', 'viewer@seed.redreach.test', 'Seed Viewer', 'viewer')
on conflict do nothing;

-- Accounts
insert into public.accounts (id, type, name, reference, status, country, city, owner_user_id, source, created_by) values
  ('eeeeeeee-0000-0000-0001-000000000001', 'ai_crm_client', 'Marina Physio Clinic', 'AC-07-99001', 'active', 'UAE', 'Dubai', 'eeeeeeee-0000-0000-0000-000000000004', 'Referral', 'seed'),
  ('eeeeeeee-0000-0000-0001-000000000002', 'ai_crm_client', 'Gulf Smile Dental', 'AC-07-99002', 'active', 'UAE', 'Dubai', 'eeeeeeee-0000-0000-0000-000000000003', 'LinkedIn', 'seed'),
  ('eeeeeeee-0000-0000-0001-000000000003', 'ai_crm_client', 'Oasis Real Estate', 'AC-07-99003', 'active', 'UAE', 'Abu Dhabi', 'eeeeeeee-0000-0000-0000-000000000003', 'Event', 'seed'),
  ('eeeeeeee-0000-0000-0001-000000000004', 'worship_church', 'ICOC UAE (seed)', 'AC-08-99001', 'active', 'UAE', 'Dubai', null, 'WorshipHub', 'seed'),
  ('eeeeeeee-0000-0000-0001-000000000005', 'worship_church', 'ICOC Abu Dhabi (seed)', 'AC-08-99002', 'active', 'UAE', 'Abu Dhabi', null, 'WorshipHub', 'seed'),
  ('eeeeeeee-0000-0000-0001-000000000006', 'ctrm_prospect', 'Jebel Ali Energy Trading', 'AC-09-99001', 'active', 'UAE', 'Dubai', 'eeeeeeee-0000-0000-0000-000000000003', 'LinkedIn', 'seed'),
  ('eeeeeeee-0000-0000-0001-000000000007', 'ctrm_prospect', 'Mumbai Metals House', 'AC-09-99002', 'active', 'India', 'Mumbai', 'eeeeeeee-0000-0000-0000-000000000003', 'Referral', 'seed'),
  ('eeeeeeee-0000-0000-0001-000000000008', 'ctrm_prospect', 'Fujairah Bunkers', 'AC-09-99003', 'active', 'UAE', 'Fujairah', 'eeeeeeee-0000-0000-0000-000000000002', 'Event', 'seed'),
  ('eeeeeeee-0000-0000-0001-000000000009', 'ctrm_prospect', 'Gujarat Agro Commodities', 'AC-09-99004', 'active', 'India', 'Ahmedabad', 'eeeeeeee-0000-0000-0000-000000000004', 'Cold email', 'seed'),
  ('eeeeeeee-0000-0000-0001-000000000010', 'ctrm_prospect', 'Doha Gas Marketing', 'AC-09-99005', 'lost', 'Qatar', 'Doha', 'eeeeeeee-0000-0000-0000-000000000002', 'Partner', 'seed')
on conflict do nothing;

insert into public.account_contacts (id, account_id, name, role, email, phone, is_primary) values
  ('eeeeeeee-0000-0000-0002-000000000001', 'eeeeeeee-0000-0000-0001-000000000001', 'Sara Haddad', 'Practice manager', 'sara@marina-physio.test', '+971500000001', true),
  ('eeeeeeee-0000-0000-0002-000000000002', 'eeeeeeee-0000-0000-0001-000000000002', 'Omar Nasser', 'Owner', 'omar@gulfsmile.test', '+971500000002', true),
  ('eeeeeeee-0000-0000-0002-000000000003', 'eeeeeeee-0000-0000-0001-000000000003', 'Priya Menon', 'Sales director', 'priya@oasis-re.test', '+971500000003', true),
  ('eeeeeeee-0000-0000-0002-000000000004', 'eeeeeeee-0000-0000-0001-000000000004', 'Church office', 'Admin', 'office@icoc-uae.test', '', true),
  ('eeeeeeee-0000-0000-0002-000000000005', 'eeeeeeee-0000-0000-0001-000000000005', 'Church office', 'Admin', 'office@icoc-ad.test', '', true),
  ('eeeeeeee-0000-0000-0002-000000000006', 'eeeeeeee-0000-0000-0001-000000000006', 'Khalid Rahman', 'Head of trading', 'khalid@jaet.test', '', true)
on conflict do nothing;

-- Contracts: one per package. Oasis renews within 60 days.
insert into public.contracts (id, account_id, package_id, option, monthly_fee, setup_fee, setup_fee_paid, term_start, term_end, status)
select v.id::uuid, v.account_id::uuid, p.id, v.opt, v.fee, v.setup, v.setup, v.start::date, (v.start::date + interval '12 months' - interval '1 day')::date, 'active'
from (values
  ('eeeeeeee-0000-0000-0003-000000000001', 'eeeeeeee-0000-0000-0001-000000000001', 'starter', 'A', 1900, 0, (current_date - interval '4 months')::text),
  ('eeeeeeee-0000-0000-0003-000000000002', 'eeeeeeee-0000-0000-0001-000000000002', 'growth', 'B', 4200, 3000, (current_date - interval '5 months')::text),
  ('eeeeeeee-0000-0000-0003-000000000003', 'eeeeeeee-0000-0000-0001-000000000003', 'done_for_you', 'A', 9000, 0, (current_date - interval '11 months')::text)
) as v(id, account_id, code, opt, fee, setup, start)
join public.delivery_packages p on p.code = v.code
on conflict do nothing;

-- Hours: Gulf Smile (target 14) logs 20 hours last month and 20 the month before.
insert into public.time_entries (id, account_id, user_email, date, hours, category, note)
select ('eeeeeeee-0000-0000-0004-' || lpad(n::text, 12, '0'))::uuid, a, 'va@seed.redreach.test', d, h, c, 'Seed'
from (values
  (1, 'eeeeeeee-0000-0000-0001-000000000002'::uuid, (date_trunc('month', current_date) - interval '1 month' + interval '3 days')::date, 12, 'support'),
  (2, 'eeeeeeee-0000-0000-0001-000000000002'::uuid, (date_trunc('month', current_date) - interval '1 month' + interval '12 days')::date, 8, 'build'),
  (3, 'eeeeeeee-0000-0000-0001-000000000002'::uuid, (date_trunc('month', current_date) - interval '2 months' + interval '5 days')::date, 10, 'build'),
  (9, 'eeeeeeee-0000-0000-0001-000000000002'::uuid, (date_trunc('month', current_date) - interval '2 months' + interval '15 days')::date, 10, 'support'),
  (4, 'eeeeeeee-0000-0000-0001-000000000002'::uuid, date_trunc('month', current_date)::date, 6, 'support'),
  (5, 'eeeeeeee-0000-0000-0001-000000000001'::uuid, date_trunc('month', current_date)::date, 3, 'reporting'),
  (6, 'eeeeeeee-0000-0000-0001-000000000001'::uuid, (date_trunc('month', current_date) - interval '1 month')::date, 4, 'support'),
  (7, 'eeeeeeee-0000-0000-0001-000000000003'::uuid, date_trunc('month', current_date)::date, 18, 'content'),
  (8, 'eeeeeeee-0000-0000-0001-000000000003'::uuid, (date_trunc('month', current_date) - interval '1 month')::date, 13, 'leads'),
  (10, 'eeeeeeee-0000-0000-0001-000000000003'::uuid, (date_trunc('month', current_date) - interval '1 month' + interval '9 days')::date, 13, 'content')
) as v(n, a, d, h, c)
on conflict do nothing;

-- Usage this month: Gulf Smile goes over its 4,000 included conversations.
insert into public.usage_records (id, account_id, month, whatsapp_marketing_count, whatsapp_service_count, ai_cost_usd, lead_credits_cost_usd) values
  ('eeeeeeee-0000-0000-0005-000000000001', 'eeeeeeee-0000-0000-0001-000000000001', date_trunc('month', current_date), 400, 300, 12, 0),
  ('eeeeeeee-0000-0000-0005-000000000002', 'eeeeeeee-0000-0000-0001-000000000002', date_trunc('month', current_date), 3200, 1500, 45, 20),
  ('eeeeeeee-0000-0000-0005-000000000003', 'eeeeeeee-0000-0000-0001-000000000003', date_trunc('month', current_date), 5000, 2500, 90, 60)
on conflict do nothing;

-- Churches. Abu Dhabi has an overdue payment and renews soon.
insert into public.worship_church_profiles (id, account_id, tenant_slug, plan, modules, whatsapp_month, whatsapp_conversations, billing_status, renewal_date, updated_by) values
  ('eeeeeeee-0000-0000-0006-000000000001', 'eeeeeeee-0000-0000-0001-000000000004', 'icoc-uae', 'Standard', '{Events,Giving,WhatsApp}', to_char(current_date, 'YYYY-MM'), 820, 'active', current_date + 200, 'seed'),
  ('eeeeeeee-0000-0000-0006-000000000002', 'eeeeeeee-0000-0000-0001-000000000005', 'icoc-abu-dhabi', 'Basic', '{Events}', to_char(current_date, 'YYYY-MM'), 140, 'past_due', current_date + 30, 'seed')
on conflict do nothing;

-- CTRM Next: five prospects across stages. Fujairah and Gujarat are stale.
insert into public.ctrm_deals (id, account_id, stage, region, company_type, source, owner_user_id, last_touch_at, next_action, next_action_date, lost_reason) values
  ('eeeeeeee-0000-0000-0007-000000000001', 'eeeeeeee-0000-0000-0001-000000000006', 'demo_done', 'middle_east', 'energy', 'LinkedIn', 'eeeeeeee-0000-0000-0000-000000000003', now() - interval '2 days', 'Send the proposal', current_date + 3, ''),
  ('eeeeeeee-0000-0000-0007-000000000002', 'eeeeeeee-0000-0000-0001-000000000007', 'intro_call_booked', 'india', 'trading_house', 'Referral', 'eeeeeeee-0000-0000-0000-000000000003', now() - interval '1 day', 'Hold the intro call', current_date + 1, ''),
  ('eeeeeeee-0000-0000-0007-000000000003', 'eeeeeeee-0000-0000-0001-000000000008', 'contacted', 'middle_east', 'energy', 'Event', 'eeeeeeee-0000-0000-0000-000000000002', now() - interval '20 days', 'Follow up on the deck', current_date - 5, ''),
  ('eeeeeeee-0000-0000-0007-000000000004', 'eeeeeeee-0000-0000-0001-000000000009', 'identified', 'india', 'other', 'Cold email', 'eeeeeeee-0000-0000-0000-000000000004', now() - interval '30 days', 'First email', current_date + 7, ''),
  ('eeeeeeee-0000-0000-0007-000000000005', 'eeeeeeee-0000-0000-0001-000000000010', 'lost', 'middle_east', 'energy', 'Partner', 'eeeeeeee-0000-0000-0000-000000000002', now() - interval '10 days', '', null, 'Stayed with their current system')
on conflict do nothing;

insert into public.ctrm_deal_stage_changes (id, deal_id, from_stage, to_stage, changed_by, changed_at) values
  ('eeeeeeee-0000-0000-0008-000000000001', 'eeeeeeee-0000-0000-0007-000000000001', 'intro_call_booked', 'demo_done', 'sales@seed.redreach.test', now() - interval '2 days'),
  ('eeeeeeee-0000-0000-0008-000000000002', 'eeeeeeee-0000-0000-0007-000000000002', 'contacted', 'intro_call_booked', 'sales@seed.redreach.test', now() - interval '1 day')
on conflict do nothing;

insert into public.ctrm_deal_commissions (id, deal_id, expected_commission) values
  ('eeeeeeee-0000-0000-0009-000000000001', 'eeeeeeee-0000-0000-0007-000000000001', 30000)
on conflict do nothing;

-- Tickets. Due times are set directly; the app computes them for real tickets.
-- Two are inside the last quarter of their window (near breach), one is past it.
insert into public.tickets (id, account_id, contact_id, subject, channel, priority, status, sla_hours, created_at, sla_due_at, first_response_at, resolved_at, created_by)
select ('eeeeeeee-0000-0000-000a-' || lpad(n::text, 12, '0'))::uuid, a, c, s, ch, pr, st, h, cr, due, fr, rs, 'seed'
from (values
  (1, 'eeeeeeee-0000-0000-0001-000000000002'::uuid, 'eeeeeeee-0000-0000-0002-000000000002'::uuid, 'Bot stopped replying on WhatsApp', 'whatsapp', 'urgent', 'open', 9, now() - interval '8 hours', now() + interval '1 hour', null::timestamptz, null::timestamptz),
  (2, 'eeeeeeee-0000-0000-0001-000000000001'::uuid, 'eeeeeeee-0000-0000-0002-000000000001'::uuid, 'Monthly report question', 'email', 'normal', 'new', 18, now() - interval '30 hours', now() + interval '3 hours', null, null),
  (3, 'eeeeeeee-0000-0000-0001-000000000003'::uuid, 'eeeeeeee-0000-0000-0002-000000000003'::uuid, 'Leads not syncing to the sheet', 'phone', 'high', 'open', 0, now() - interval '6 hours', now() - interval '1 hour', null, null),
  (4, 'eeeeeeee-0000-0000-0001-000000000003'::uuid, null, 'Add a new agent', 'email', 'low', 'new', 9, now() - interval '1 hour', now() + interval '20 hours', null, null),
  (5, 'eeeeeeee-0000-0000-0001-000000000002'::uuid, null, 'Change the greeting message', 'email', 'normal', 'waiting_on_client', 9, now() - interval '2 days', now() - interval '1 day', now() - interval '40 hours', null),
  (6, 'eeeeeeee-0000-0000-0001-000000000001'::uuid, null, 'Invoice copy', 'email', 'low', 'resolved', 18, now() - interval '5 days', now() - interval '3 days', now() - interval '4 days', now() - interval '4 days'),
  (7, 'eeeeeeee-0000-0000-0001-000000000004'::uuid, 'eeeeeeee-0000-0000-0002-000000000004'::uuid, 'Cannot add a new member', 'email', 'normal', 'new', 18, now() - interval '3 hours', now() + interval '2 days', null, null),
  (8, 'eeeeeeee-0000-0000-0001-000000000004'::uuid, null, 'Event registration page is slow', 'whatsapp', 'high', 'open', 18, now() - interval '1 day', now() + interval '1 day', now() - interval '20 hours', null),
  (9, 'eeeeeeee-0000-0000-0001-000000000005'::uuid, 'eeeeeeee-0000-0000-0002-000000000005'::uuid, 'Giving report totals look wrong', 'email', 'normal', 'open', 18, now() - interval '2 days', now() + interval '10 days', null, null),
  (10, 'eeeeeeee-0000-0000-0001-000000000005'::uuid, null, 'Reset an admin password', 'phone', 'low', 'closed', 18, now() - interval '9 days', now() - interval '7 days', now() - interval '9 days', now() - interval '8 days'),
  (11, 'eeeeeeee-0000-0000-0001-000000000006'::uuid, null, 'Asked for a CTRM Next brochure', 'email', 'low', 'new', 18, now() - interval '2 hours', now() + interval '3 days', null, null),
  (12, null, null, 'Email from an unknown sender', 'email', 'normal', 'new', 18, now() - interval '1 hour', now() + interval '2 days', null, null)
) as v(n, a, c, s, ch, pr, st, h, cr, due, fr, rs)
on conflict do nothing;

commit;

-- To remove all seed data again (accounts cascade to their contacts,
-- contracts, hours, usage, tickets, deals and church details):
--
--   delete from public.tickets where id::text like 'eeeeeeee-%';
--   delete from public.accounts where id::text like 'eeeeeeee-%';
--   delete from public.app_users where id::text like 'eeeeeeee-%';
