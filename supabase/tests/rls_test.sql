-- RLS regression tests. Each check raises an exception on failure.
-- Run via supabase/tests/run.sh.
\set ON_ERROR_STOP 1

insert into auth.users values
  -- Admin JWT must be @redreach.ae: migration 20261006150000 deactivates Gmail app_users.
  ('00000000-0000-0000-0000-00000000000a', 'alfred@redreach.ae', now()),
  ('00000000-0000-0000-0000-00000000000b', 'sales@redreach.ae', now()),
  ('00000000-0000-0000-0000-00000000000c', 'random@gmail.com', now()),
  ('00000000-0000-0000-0000-00000000000d', 'unconfirmed@redreach.ae', null),
  ('00000000-0000-0000-0000-00000000000e', 'former@redreach.ae', now()),
  ('00000000-0000-0000-0000-00000000000f', 'alfredsv@gmail.com', now());
insert into app_users (email, name, role, active) values
  ('Sales@RedReach.ae', 'Sales', 'sales', true),
  ('unconfirmed@redreach.ae', 'U', 'sales', true),
  ('former@redreach.ae', 'Former', 'sales', false);
insert into app_settings values ('zohoClientSecret', 's3cret'), ('zohoRefreshToken', 'rt'), ('zohoClientId', 'cid');
insert into vendors (company_name) values ('Acme Supplier');
insert into crm (company_name) values ('Lead Co');
insert into invoices (client, reference_number) values ('Client A', 'RR-1');
insert into expenses (vendor) values ('Fuel');
insert into owned_domains (domain_name, registrar) values ('example.ae', 'Registrar Co');

create function pg_temp.expect(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'RLS TEST FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;

-- Domain lock from 20261006150000_redreach_email_login_only.sql
select pg_temp.expect(
  (select active from app_users where lower(email) = 'alfredsv@gmail.com') = false,
  'gmail founding admin deactivated by domain migration'
);
select pg_temp.expect(
  (select active from app_users where lower(email) = 'alfred@redreach.ae') = true,
  'redreach.ae founding admin stays active'
);

-- Helper that returns true if the statement raised an error.
create function pg_temp.fails(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return true;
end $$;

grant execute on all functions in schema pg_temp to anon, authenticated;

------------------------------------------------------------ anonymous visitor
set role anon;
select pg_temp.expect(pg_temp.fails('select 1 from vendors'), 'anon cannot read vendors');
select pg_temp.expect(pg_temp.fails('select 1 from owned_domains'), 'anon cannot read owned_domains');
select pg_temp.expect(pg_temp.fails('select 1 from customer_documents'), 'anon cannot read customer_documents');
select pg_temp.expect(pg_temp.fails('select 1 from crm'), 'anon cannot read crm');
select pg_temp.expect(pg_temp.fails('select 1 from website_inquiries'), 'anon cannot read inquiries');
select pg_temp.expect(not pg_temp.fails($q$insert into website_inquiries (name, email, message) values ('Visitor', 'v@x.com', 'hi')$q$), 'anon can submit contact form');
select pg_temp.expect(pg_temp.fails($q$insert into website_inquiries (name, email, status) values ('X', 'x@x.com', 'converted')$q$), 'anon cannot forge inquiry status');
select pg_temp.expect(pg_temp.fails($q$insert into website_inquiries (name, email, message) values ('X', 'x@x.com', repeat('a', 6000))$q$), 'anon inquiry message length capped');
reset role;

------------------------------------------------------------ signed in, not on team
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect((select count(*) from crm) = 0, 'stranger sees no CRM');
select pg_temp.expect((select count(*) from app_settings) = 0, 'stranger sees no settings');
select pg_temp.expect((select count(*) from app_users) = 0, 'stranger sees no users');
select pg_temp.expect(pg_temp.fails($q$insert into crm (company_name) values ('x')$q$), 'stranger cannot insert CRM');
select pg_temp.expect(pg_temp.fails($q$insert into app_users (email, role) values ('random@gmail.com', 'admin')$q$), 'stranger cannot add self as admin');

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.expect((select count(*) from crm) = 0, 'unconfirmed email sees nothing');

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
select pg_temp.expect((select count(*) from crm) = 0, 'deactivated user sees nothing');

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000f';
select pg_temp.expect((select count(*) from crm) = 0, 'deactivated gmail admin sees nothing');
reset role;

------------------------------------------------------------ sales
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
-- Count only the fixture row: migrations may seed other CRM rows (e.g. Mass Allied Freighters).
select pg_temp.expect((select count(*) from crm where company_name = 'Lead Co') = 1, 'sales reads CRM (email match is case-insensitive)');
select pg_temp.expect((select count(*) from owned_domains) = 1, 'sales reads owned domains');
update owned_domains set registrar = 'Updated' where domain_name = 'example.ae';
select pg_temp.expect((select registrar from owned_domains where domain_name = 'example.ae') = 'Updated', 'sales can update owned domains');
select pg_temp.expect((select count(*) from app_settings where key in ('zohoClientSecret', 'zohoRefreshToken')) = 0, 'sales cannot read Zoho secrets');
select pg_temp.expect((select count(*) from app_settings where key = 'zohoClientId') = 1, 'sales can read Zoho client id');
update crm set notes = 'called' where company_name = 'Lead Co';
select pg_temp.expect((select notes from crm where company_name = 'Lead Co') = 'called', 'sales can update CRM');
select pg_temp.expect(
  pg_temp.fails($q$update crm set owner = 'other@redreach.ae' where company_name = 'Lead Co'$q$),
  'sales cannot reassign CRM owner'
);
delete from crm where company_name = 'Lead Co';
select pg_temp.expect((select count(*) from crm where company_name = 'Lead Co') = 1, 'sales cannot delete CRM');
insert into quotations (client, quote_id, reference_number) values ('Lead Co', 'Q-TEST-1', 'Q-TEST-1');
delete from quotations where quote_id = 'Q-TEST-1';
select pg_temp.expect((select count(*) from quotations where quote_id = 'Q-TEST-1') = 1, 'sales cannot delete quotations');
insert into app_settings values ('delivery_notes_store', '[]');
update app_settings set value = 'HACK' where key = 'iban';
delete from invoices where reference_number = 'RR-1';
delete from expenses where vendor = 'Fuel';
update app_users set role = 'admin' where lower(email) = 'sales@redreach.ae';
select pg_temp.expect((select count(*) from audit_log) = 0, 'sales cannot read audit log');
select pg_temp.expect(pg_temp.fails($q$insert into audit_log (table_name, operation) values ('crm', 'DELETE')$q$), 'sales cannot forge audit rows');
reset role;
select pg_temp.expect((select value from app_settings where key = 'iban') <> 'HACK', 'sales cannot change bank details');
select pg_temp.expect((select count(*) from invoices where reference_number = 'RR-1') = 1, 'sales cannot delete invoices');
select pg_temp.expect((select count(*) from expenses where vendor = 'Fuel') = 1, 'sales cannot delete expenses');
select pg_temp.expect((select role from app_users where lower(email) = 'sales@redreach.ae') = 'sales', 'sales cannot promote self');
select pg_temp.expect(exists (select 1 from app_settings where key = 'delivery_notes_store'), 'sales can write ordinary settings');

------------------------------------------------------------ admin
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect((select value from app_settings where key = 'zohoClientSecret') = 's3cret', 'admin reads secrets');
update app_settings set value = 'AE00' where key = 'iban';
delete from invoices where reference_number = 'RR-1';
select pg_temp.expect((select count(*) from invoices where reference_number = 'RR-1') = 0, 'admin can delete invoices');
update app_settings set value = 'new-secret' where key = 'zohoClientSecret';
select pg_temp.expect(exists (
  select 1 from audit_log where table_name = 'invoices' and operation = 'DELETE' and actor_email = 'alfred@redreach.ae'
), 'audit log records who deleted an invoice');
select pg_temp.expect(exists (
  select 1 from audit_log where table_name = 'crm' and operation = 'UPDATE' and actor_email = 'sales@redreach.ae' and changed_fields = '{notes}'
), 'audit log records changed fields');
select pg_temp.expect(not exists (
  select 1 from audit_log where table_name = 'app_settings' and (new_data::text like '%new-secret%' or old_data::text like '%s3cret%')
), 'audit log redacts secrets');
reset role;

------------------------------------------------------------ company documents vault
insert into company_documents (category, title, drive_url, expires_on)
values ('trade_license', 'Trade license', 'https://workdrive.example/doc', current_date + 10);

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect((select count(*) from company_documents) = 0, 'sales cannot read company documents');
select pg_temp.expect(pg_temp.fails($q$insert into company_documents (title) values ('x')$q$), 'sales cannot insert company documents');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect((select count(*) from company_documents) = 1, 'admin can read company documents');
update company_documents set notes = 'renew' where title = 'Trade license';
select pg_temp.expect((select notes from company_documents where title = 'Trade license') = 'renew', 'admin can update company documents');
reset role;

------------------------------------------------------------ accounts (Phase 1 modules)
insert into auth.users values
  ('00000000-0000-0000-0000-000000000011', 'va@redreach.ae', now()),
  ('00000000-0000-0000-0000-000000000012', 'viewer@redreach.ae', now()),
  ('00000000-0000-0000-0000-000000000013', 'manager@redreach.ae', now());
insert into app_users (email, name, role, active) values
  ('va@redreach.ae', 'VA', 'staff', true),
  ('viewer@redreach.ae', 'Viewer', 'viewer', true),
  ('manager@redreach.ae', 'Manager', 'manager', true);
insert into accounts (type, name, reference, owner_user_id) values
  ('ai_crm_client', 'Assigned Clinic LLC', 'AC-07-26001', (select id from app_users where email = 'va@redreach.ae')),
  ('worship_church', 'Unassigned Church', 'AC-08-26001', null),
  ('ctrm_prospect', 'Other Trading House', 'AC-09-26001', (select id from app_users where email = 'alfred@redreach.ae'));
insert into account_contacts (account_id, name) select id, 'Hidden Contact' from accounts where name = 'Unassigned Church';
insert into account_activities (account_id, kind, body) select id, 'note', 'secret note' from accounts where name = 'Unassigned Church';
insert into clients (company_name) values ('Assigned Clinic L.L.C.');
insert into invoices (client, reference_number) values ('Assigned Clinic', 'RR-03-26001');

-- staff (VA): only the account they own
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect((select count(*) from accounts) = 1, 'staff sees only assigned accounts');
select pg_temp.expect((select name from accounts) = 'Assigned Clinic LLC', 'staff sees the right account');
select pg_temp.expect((select count(*) from account_contacts) = 0, 'staff cannot see contacts on unassigned accounts');
select pg_temp.expect((select count(*) from account_activities) = 0, 'staff cannot see timeline on unassigned accounts');
select pg_temp.expect((select count(*) from crm) = 0, 'staff cannot read the old CRM');
select pg_temp.expect((select count(*) from invoices) = 0, 'staff cannot read invoices');
select pg_temp.expect((select count(*) from app_users) > 0, 'staff can read the team list');
select pg_temp.expect((select count(*) from app_settings where key = 'zohoClientSecret') = 0, 'staff cannot read secrets');
select pg_temp.expect(not pg_temp.fails($q$insert into account_activities (account_id, kind, body) select id, 'call', 'rang them' from accounts where name = 'Assigned Clinic LLC'$q$), 'staff can add to timeline on own account');
select pg_temp.expect(pg_temp.fails($q$insert into account_activities (account_id, kind, body) values ((select id from accounts limit 1), 'note', 'x'), ('00000000-0000-0000-0000-0000000000ff', 'note', 'y')$q$), 'staff cannot write timeline on unknown accounts');
select pg_temp.expect(pg_temp.fails($q$insert into accounts (type, name) values ('ctrm_prospect', 'Not mine')$q$), 'staff cannot create an account owned by nobody');
select pg_temp.expect(not pg_temp.fails($q$insert into accounts (type, name, owner_user_id) values ('ctrm_prospect', 'VA Prospect', public.rr_current_user_id())$q$), 'staff can create an account they own');
select pg_temp.expect(pg_temp.fails($q$update accounts set owner_user_id = null where name = 'VA Prospect'$q$), 'staff cannot hand an account away');
reset role;
select pg_temp.expect((select count(*) from account_activities where body = 'x') = 0, 'blocked timeline insert left no row');

-- viewer: reads everything, writes nothing
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000012';
select pg_temp.expect((select count(*) from accounts) = 4, 'viewer reads all accounts');
select pg_temp.expect((select count(*) from account_contacts) = 1, 'viewer reads contacts');
select pg_temp.expect((select count(*) from invoices where reference_number = 'RR-03-26001') = 1, 'viewer reads invoices');
select pg_temp.expect(pg_temp.fails($q$insert into accounts (type, name) values ('ctrm_prospect', 'Viewer made')$q$), 'viewer cannot create accounts');
update accounts set name = 'Hacked' where name = 'Unassigned Church';
select pg_temp.expect(pg_temp.fails($q$insert into account_activities (account_id, kind, body) select id, 'note', 'v' from accounts limit 1$q$), 'viewer cannot write timeline');
select pg_temp.expect(pg_temp.fails($q$insert into crm (company_name) values ('v')$q$), 'viewer cannot write CRM');
select pg_temp.expect((select count(*) from audit_log) = 0, 'viewer cannot read audit log');
reset role;
select pg_temp.expect(exists (select 1 from accounts where name = 'Unassigned Church'), 'viewer update changed nothing');

-- sales: sees all accounts, cannot reassign or delete
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect((select count(*) from accounts) = 4, 'sales sees all accounts');
select pg_temp.expect(pg_temp.fails($q$update accounts set owner_user_id = null where name = 'Assigned Clinic LLC'$q$), 'sales cannot reassign accounts');
delete from accounts where name = 'Unassigned Church';
reset role;
select pg_temp.expect(exists (select 1 from accounts where name = 'Unassigned Church'), 'sales cannot delete accounts');

-- manager: can reassign
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000013';
update accounts set owner_user_id = null where name = 'VA Prospect';
reset role;
select pg_temp.expect((select owner_user_id from accounts where name = 'VA Prospect') is null, 'manager can reassign accounts');

-- anon: nothing
set role anon;
select pg_temp.expect(pg_temp.fails('select 1 from accounts'), 'anon cannot read accounts');
reset role;

-- linking: dry run changes nothing, apply links, undo restores
select pg_temp.expect(
  (select count(*) from rr_link_accounts() where kind = 'match' and account_name = 'Assigned Clinic LLC') = 2,
  'dry run finds the client and the invoice for an account'
);
select pg_temp.expect((select account_id from invoices where reference_number = 'RR-03-26001') is null, 'dry run changes nothing');
create temp table link_run as select * from rr_link_accounts(p_dry_run => false);
select pg_temp.expect(
  (select a.name from invoices i join accounts a on a.id = i.account_id where i.reference_number = 'RR-03-26001') = 'Assigned Clinic LLC',
  'apply links the invoice to the account'
);
select pg_temp.expect((select client from invoices where reference_number = 'RR-03-26001') = 'Assigned Clinic', 'linking leaves the invoice client name as it was');
select pg_temp.expect(rr_unlink_accounts((select batch_id from link_run limit 1)) = 2, 'undo clears exactly the applied batch');
select pg_temp.expect((select account_id from invoices where reference_number = 'RR-03-26001') is null, 'undo restores the invoice');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect(pg_temp.fails('select * from rr_link_accounts()'), 'app users cannot run the link script');
reset role;
select pg_temp.expect(rr_normalize_company_name('Al Noor Trading L.L.C.') = 'al noor', 'company names drop legal suffixes');
select pg_temp.expect(rr_normalize_company_name('The Coffee Co') = 'coffee', 'company names drop leading the and co');

------------------------------------------------------------ client delivery (Phase 2)
insert into contracts (account_id, package_id, monthly_fee, term_start, term_end)
  select a.id, p.id, 4500, '2026-01-01', '2026-12-31'
  from accounts a, delivery_packages p where a.name = 'Assigned Clinic LLC' and p.code = 'growth';
insert into contracts (account_id, package_id, monthly_fee)
  select a.id, p.id, 9000 from accounts a, delivery_packages p
  where a.name = 'Unassigned Church' and p.code = 'done_for_you';
insert into time_entries (account_id, hours, category) select id, 3, 'build' from accounts where name = 'Unassigned Church';
insert into usage_records (account_id, month, whatsapp_marketing_count) select id, '2026-10-01', 5000 from accounts where name = 'Unassigned Church';

select pg_temp.expect((select count(*) from delivery_packages) = 3, 'package catalogue seeded');
select pg_temp.expect(
  (select monthly_fee_a from delivery_packages where code = 'growth') = 4500,
  'growth package price from the brief'
);
select pg_temp.expect(pg_temp.fails($q$insert into usage_records (account_id, month) select id, '2026-10-15' from accounts limit 1$q$), 'usage month must be the first of the month');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect((select count(*) from contracts) = 1, 'staff sees only the contract on their account');
select pg_temp.expect((select count(*) from time_entries) = 0, 'staff cannot see hours on other accounts');
select pg_temp.expect((select count(*) from usage_records) = 0, 'staff cannot see usage on other accounts');
select pg_temp.expect(not pg_temp.fails($q$insert into time_entries (account_id, user_id, hours, category) select id, public.rr_current_user_id(), 1.5, 'support' from accounts where name = 'Assigned Clinic LLC'$q$), 'staff logs own hours on own account');
select pg_temp.expect(pg_temp.fails($q$insert into time_entries (account_id, user_id, hours) select id, (select id from app_users where email = 'alfred@redreach.ae'), 1 from accounts where name = 'Assigned Clinic LLC'$q$), 'staff cannot log hours as someone else');
select pg_temp.expect(pg_temp.fails($q$insert into time_entries (account_id, user_id, hours) values ((select id from accounts where name = 'Assigned Clinic LLC'), public.rr_current_user_id(), 30)$q$), 'hours capped at 24 a day');
select pg_temp.expect(not pg_temp.fails($q$insert into usage_records (account_id, month, whatsapp_service_count) select id, '2026-10-01', 120 from accounts where name = 'Assigned Clinic LLC'$q$), 'staff records usage on own account');
select pg_temp.expect(pg_temp.fails($q$update contracts set monthly_fee = 1 where true$q$) or (select monthly_fee from contracts) = 4500, 'staff cannot change contract fees');
select pg_temp.expect(pg_temp.fails($q$insert into contracts (account_id, monthly_fee) select id, 1 from accounts where name = 'Assigned Clinic LLC'$q$), 'staff cannot create contracts');
select pg_temp.expect(pg_temp.fails($q$update delivery_packages set monthly_fee_a = 1$q$) or (select monthly_fee_a from delivery_packages where code = 'starter') = 1900, 'staff cannot edit packages');
select pg_temp.expect((select value from app_settings where key = 'deliveryMarketingRateAed') = '0.30', 'staff can read overage rates');
reset role;
select pg_temp.expect((select monthly_fee from contracts c join accounts a on a.id = c.account_id where a.name = 'Assigned Clinic LLC') = 4500, 'contract fee unchanged after staff attempt');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
update app_settings set value = '0.01' where key = 'deliveryMarketingRateAed';
update delivery_packages set monthly_fee_a = 1 where code = 'starter';
select pg_temp.expect(not pg_temp.fails($q$insert into contracts (account_id, monthly_fee) select id, 1900 from accounts where name = 'VA Prospect'$q$), 'sales can create contracts');
reset role;
select pg_temp.expect((select value from app_settings where key = 'deliveryMarketingRateAed') = '0.30', 'sales cannot change overage rates');
select pg_temp.expect((select monthly_fee_a from delivery_packages where code = 'starter') = 1900, 'sales cannot edit packages');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000013';
update delivery_packages set ai_cap_usd = 40 where code = 'growth';
reset role;
select pg_temp.expect((select ai_cap_usd from delivery_packages where code = 'growth') = 40, 'manager can edit packages');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000012';
select pg_temp.expect((select count(*) from contracts) >= 2, 'viewer reads contracts');
select pg_temp.expect(pg_temp.fails($q$insert into time_entries (account_id, hours) select id, 1 from accounts limit 1$q$), 'viewer cannot log hours');
reset role;

------------------------------------------------------------ support desk (Phase 3)
select pg_temp.expect((select count(*) from sla_policies where applies_to = 'package') = 3, 'an SLA policy for each package');
select pg_temp.expect(
  (select first_response_hours from sla_policies s join delivery_packages p on p.id = s.package_id where p.code = 'growth') = 9,
  'growth answers within one working day'
);
select pg_temp.expect(
  (select first_response_hours from sla_policies where account_type = 'worship_church') = 18,
  'churches default to two working days'
);
insert into tickets (account_id, subject) select id, 'Clinic bot down' from accounts where name = 'Assigned Clinic LLC';
insert into tickets (account_id, subject) select id, 'Church app login' from accounts where name = 'Unassigned Church';
insert into tickets (account_id, requester_email, subject) values (null, 'someone@example.com', 'Unknown sender');
insert into ticket_messages (ticket_id, author_kind, author_label, body)
  select id, 'contact', 'pastor@church.example', 'Cannot log in' from tickets where subject = 'Church app login';
select id as church_id from accounts where name = 'Unassigned Church' \gset

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect((select count(*) from tickets) = 1, 'staff sees only tickets on their accounts');
select pg_temp.expect((select count(*) from ticket_messages) = 0, 'staff cannot read messages on other tickets');
select pg_temp.expect(not pg_temp.fails($q$insert into tickets (account_id, subject) select id, 'Follow up' from accounts where name = 'Assigned Clinic LLC'$q$), 'staff opens a ticket on own account');
select pg_temp.expect(pg_temp.fails(format('insert into tickets (account_id, subject) values (%L, %L)', :'church_id', 'Sneaky')), 'staff cannot open a ticket on another account');
select pg_temp.expect(pg_temp.fails($q$insert into tickets (account_id, subject) values (null, 'No account')$q$), 'staff cannot open an unfiled ticket');
select pg_temp.expect(not pg_temp.fails($q$insert into ticket_messages (ticket_id, author_kind, author_user_id, body) select id, 'user', public.rr_current_user_id(), 'On it' from tickets where subject = 'Clinic bot down'$q$), 'staff replies on own ticket');
select pg_temp.expect(not pg_temp.fails($q$insert into time_entries (account_id, user_id, hours, category, ticket_id) select account_id, public.rr_current_user_id(), 0.25, 'support', id from tickets where subject = 'Clinic bot down'$q$), 'staff logs ticket time on own ticket');
select pg_temp.expect(pg_temp.fails($q$insert into ticket_messages (ticket_id, author_kind, body) select id, 'contact', 'Fake client words' from tickets where subject = 'Clinic bot down'$q$), 'staff cannot post as the client');
select pg_temp.expect(pg_temp.fails($q$insert into ticket_messages (ticket_id, author_kind, author_user_id, body) select id, 'user', (select id from app_users where email = 'alfred@redreach.ae'), 'x' from tickets where subject = 'Clinic bot down'$q$), 'staff cannot reply as someone else');
update tickets set status = 'closed';
select pg_temp.expect(pg_temp.fails($q$update sla_policies set first_response_hours = 1$q$) or (select min(first_response_hours) from sla_policies) >= 4, 'staff cannot edit SLA policies');
reset role;
select pg_temp.expect((select status from tickets where subject = 'Church app login') = 'new', 'staff update did not touch other tickets');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect((select count(*) from tickets where account_id is null) = 1, 'sales sees unfiled email tickets');
select pg_temp.expect(not pg_temp.fails($q$update tickets set account_id = (select id from accounts where name = 'VA Prospect') where account_id is null$q$), 'sales files an unknown sender on an account');
update app_settings set value = '1,2,3,4,5,6' where key = 'supportWorkingDays';
reset role;
select pg_temp.expect((select value from app_settings where key = 'supportWorkingDays') = '1,2,3,4,5', 'sales cannot change the working week');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000013';
update sla_policies set first_response_hours = 20 where account_type = 'worship_church';
reset role;
select pg_temp.expect((select first_response_hours from sla_policies where account_type = 'worship_church') = 20, 'manager edits SLA policies');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000012';
select pg_temp.expect((select count(*) from tickets) >= 3, 'viewer reads tickets');
select pg_temp.expect(pg_temp.fails($q$insert into tickets (account_id, subject) select id, 'x' from accounts limit 1$q$), 'viewer cannot open tickets');
reset role;

set role anon;
select pg_temp.expect(pg_temp.fails('select 1 from tickets'), 'anon cannot read tickets');
reset role;

------------------------------------------------------------ CTRM Next pipeline (Phase 4)
insert into accounts (type, name, reference, owner_user_id) values
  ('ctrm_prospect', 'VA Energy Lead', 'AC-09-26002', (select id from app_users where email = 'va@redreach.ae'));
insert into ctrm_deals (account_id, stage, region, next_action, next_action_date)
  select id, 'contacted', 'middle_east', 'Send deck', '2026-11-01' from accounts where name = 'Other Trading House';
insert into ctrm_deals (account_id, stage, region, next_action, next_action_date)
  select id, 'identified', 'india', 'First call', '2026-11-02' from accounts where name = 'VA Energy Lead';
insert into ctrm_deal_commissions (deal_id, expected_commission)
  select d.id, 25000 from ctrm_deals d join accounts a on a.id = d.account_id;
select id as other_deal from ctrm_deals where account_id = (select id from accounts where name = 'Other Trading House') \gset

select pg_temp.expect(pg_temp.fails($q$update ctrm_deals set stage = 'lost' where region = 'india'$q$), 'lost needs a reason');
select pg_temp.expect(not pg_temp.fails($q$update ctrm_deals set stage = 'lost', lost_reason_code = 'Competitor won', lost_reason = 'Chose another vendor' where region = 'india'$q$), 'lost with a reason is fine');
update ctrm_deals set stage = 'identified', lost_reason = '' where region = 'india';
select pg_temp.expect(pg_temp.fails($q$update ctrm_deals set next_action = '' where region = 'india'$q$), 'open deals need a next action');
select pg_temp.expect(pg_temp.fails($q$update ctrm_deals set next_action_date = null where region = 'india'$q$), 'open deals need a next action date');
select pg_temp.expect(not pg_temp.fails($q$update ctrm_deals set stage = 'signed', next_action = '', next_action_date = null where region = 'middle_east'$q$), 'signed deals need no next action');
update ctrm_deals set stage = 'contacted', next_action = 'Send deck', next_action_date = '2026-11-01' where region = 'middle_east';

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect((select count(*) from ctrm_deals) = 1, 'staff sees only deals on their accounts');
select pg_temp.expect((select count(*) from ctrm_deal_commissions) = 0, 'staff never sees commission figures');
select pg_temp.expect(not pg_temp.fails($q$update ctrm_deals set stage = 'contacted' where region = 'india'$q$), 'staff moves their own deal');
select pg_temp.expect(not pg_temp.fails($q$insert into ctrm_deal_stage_changes (deal_id, from_stage, to_stage) select id, 'identified', 'contacted' from ctrm_deals where region = 'india'$q$), 'staff records the stage move');
select pg_temp.expect(pg_temp.fails(format('insert into ctrm_deal_stage_changes (deal_id, to_stage) values (%L, %L)', :'other_deal', 'signed')), 'staff cannot write history on other deals');
update ctrm_deal_commissions set commission_received = 1 where deal_id = :'other_deal';
reset role;
select pg_temp.expect((select commission_received from ctrm_deal_commissions where deal_id = :'other_deal') = 0, 'commission unchanged after staff attempt');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect((select count(*) from ctrm_deal_commissions) = 2, 'sales reads Red Reach commission');
select pg_temp.expect(pg_temp.fails($q$update ctrm_deal_stage_changes set to_stage = 'signed'$q$) or (select count(*) from ctrm_deal_stage_changes where to_stage = 'signed') = 0, 'stage history cannot be rewritten');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000012';
select pg_temp.expect((select count(*) from ctrm_deals) = 2, 'viewer reads deals');
select pg_temp.expect((select count(*) from ctrm_deal_commissions) = 0, 'viewer never sees commission figures');
select pg_temp.expect(pg_temp.fails($q$insert into ctrm_deals (account_id, next_action, next_action_date) select id, 'x', '2026-12-01' from accounts where name = 'Other Trading House'$q$), 'viewer cannot add deals');
reset role;

set role anon;
select pg_temp.expect(pg_temp.fails('select 1 from ctrm_deals'), 'anon cannot read deals');
reset role;

------------------------------------------------------------ WorshipHub products (Phase 5)
insert into accounts (type, name, reference, owner_user_id) values
  ('worship_church', 'VA Church', 'AC-08-26002', (select id from app_users where email = 'va@redreach.ae'));
insert into worship_church_profiles (account_id, tenant_slug, plan)
  select id, 'other-church', 'Standard' from accounts where name = 'Unassigned Church';
select id as unassigned_church from accounts where name = 'Unassigned Church' \gset
select id as va_church from accounts where name = 'VA Church' \gset

select pg_temp.expect(pg_temp.fails($q$insert into worship_church_profiles (account_id, tenant_slug) select id, 'Bad Slug' from accounts where name = 'VA Church'$q$), 'slug must be lowercase letters, digits and hyphens');
select pg_temp.expect(pg_temp.fails($q$insert into worship_church_profiles (account_id, admin_url) select id, 'http://x.test' from accounts where name = 'VA Church'$q$), 'admin link must be https');

-- Setup script: dry run changes nothing, apply creates and links, undo reverses.
select pg_temp.expect((select count(*) from rr_add_worshiphub_churches()) = 2, 'setup dry run lists both tenants');
select pg_temp.expect((select count(*) from accounts where type = 'worship_church') = 2, 'setup dry run changes nothing');
insert into accounts (type, name, reference) values ('worship_church', 'ICOC UAE', 'AC-08-26003');
select pg_temp.expect(
  (select string_agg(action, ',' order by slug) from rr_add_worshiphub_churches()) = 'create church account,add slug to existing account',
  'setup matches ICOC UAE by name and creates Abu Dhabi');
select distinct batch_id as wh_batch from rr_add_worshiphub_churches(p_dry_run => false) \gset
select pg_temp.expect((select reference from accounts where name = 'ICOC Abu Dhabi') = 'AC-08-' || to_char(now(), 'YY') || (case when to_char(now(), 'YY') = '26' then '004' else '001' end), 'new church gets the next AC-08 reference');
select pg_temp.expect((select count(*) from worship_church_profiles where tenant_slug in ('icoc-uae', 'icoc-abu-dhabi')) = 2, 'setup links both tenants');
select pg_temp.expect((select string_agg(action, ',') from rr_add_worshiphub_churches()) = 'already set up,already set up', 'setup is safe to re-run');
select pg_temp.expect(rr_undo_worshiphub_churches(:'wh_batch') = 2, 'setup undo reverses both rows');
select pg_temp.expect((select count(*) from accounts where name = 'ICOC Abu Dhabi') = 0 and (select count(*) from accounts where name = 'ICOC UAE') = 1, 'undo removes only what setup created');
delete from accounts where name = 'ICOC UAE';

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect(pg_temp.fails('select rr_add_worshiphub_churches()'), 'app users cannot run the setup');
select pg_temp.expect((select count(*) from worship_church_profiles) = 0, 'staff cannot see other churches');
select pg_temp.expect(not pg_temp.fails($q$insert into worship_church_profiles (account_id, tenant_slug) select id, 'va-church' from accounts where name = 'VA Church'$q$), 'staff adds details to their own church');
select pg_temp.expect(pg_temp.fails(format('insert into worship_church_profiles (account_id) values (%L)', :'unassigned_church')), 'staff cannot add details to other churches');
update worship_church_profiles set plan = 'Hacked' where account_id = :'unassigned_church';
select pg_temp.expect(pg_temp.fails($q$insert into worship_church_profiles (account_id) select id from accounts where name = 'VA Energy Lead'$q$), 'church details only on church accounts');
reset role;
select pg_temp.expect((select plan from worship_church_profiles where account_id = :'unassigned_church') = 'Standard', 'other church unchanged after staff attempt');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000012';
select pg_temp.expect((select count(*) from worship_church_profiles) = 2, 'viewer reads church details');
select pg_temp.expect(pg_temp.fails(format('update worship_church_profiles set plan = %L where account_id = %L returning 1', 'x', :'va_church')) or (select plan from worship_church_profiles where account_id = :'va_church') = '', 'viewer cannot edit church details');
reset role;

set role anon;
select pg_temp.expect(pg_temp.fails('select 1 from worship_church_profiles'), 'anon cannot read church details');
reset role;

------------------------------------------------------------ Dashboard costs (Phase 6)
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000013';
update app_settings set value = '99999' where key = 'deliveryFixedMonthlyCostAed';
reset role;
select pg_temp.expect((select value from app_settings where key = 'deliveryFixedMonthlyCostAed') = '0', 'manager cannot change the fixed cost estimate');

------------------------------------------------------------ Contract billing (roadmap item 2)
select pg_temp.expect((select bool_and(not auto_invoice) from contracts), 'existing contracts start with auto invoicing off');
insert into contract_invoices (contract_id, account_id, kind, period)
  select id, account_id, 'monthly', '2026-11-01' from contracts where account_id = (select id from accounts where name = 'Assigned Clinic LLC') limit 1;
select pg_temp.expect(pg_temp.fails($q$insert into contract_invoices (contract_id, account_id, kind, period) select contract_id, account_id, 'monthly', '2026-11-01' from contract_invoices limit 1$q$), 'a contract month is only invoiced once');
select pg_temp.expect(pg_temp.fails($q$insert into contract_invoices (contract_id, account_id, kind, period) select contract_id, account_id, 'monthly', '2026-11-15' from contract_invoices limit 1$q$), 'invoice period is the first of the month');
insert into invoice_reminders (invoice_id, stage) select id, 3 from invoices where reference_number = 'RR-03-26001';
select pg_temp.expect(pg_temp.fails($q$insert into invoice_reminders (invoice_id, stage) select id, 3 from invoices where reference_number = 'RR-03-26001'$q$), 'each reminder stage is recorded once');
select pg_temp.expect(pg_temp.fails($q$insert into invoice_reminders (invoice_id, stage) select id, 5 from invoices where reference_number = 'RR-03-26001'$q$), 'reminders only at 3, 7 and 14 days');

select id as reminder_invoice from invoices where reference_number = 'RR-03-26001' \gset
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect((select count(*) from contract_invoices) = 0, 'staff cannot see contract invoices');
select pg_temp.expect((select count(*) from invoice_reminders) = 0, 'staff cannot see payment reminders');
select pg_temp.expect(pg_temp.fails(format('insert into invoice_reminders (invoice_id, stage) values (%L, 7)', :'reminder_invoice')), 'staff cannot record reminders');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect((select count(*) from contract_invoices) = 1, 'sales sees contract invoices');
select pg_temp.expect(not pg_temp.fails($q$insert into invoice_reminders (invoice_id, stage, channel) select id, 7, 'whatsapp' from invoices where reference_number = 'RR-03-26001'$q$), 'sales records a reminder');
delete from invoice_reminders;
select pg_temp.expect((select count(*) from invoice_reminders) = 2, 'only admins delete reminders');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000012';
select pg_temp.expect((select count(*) from invoice_reminders) = 2, 'viewer reads payment reminders');
select pg_temp.expect(pg_temp.fails(format('insert into invoice_reminders (invoice_id, stage) values (%L, 14)', :'reminder_invoice')), 'viewer cannot record reminders');
reset role;

------------------------------------------------------------ Usage import (roadmap item 3)
insert into usage_sources (account_id, whatsapp_phones, ai_workspace_id)
  select id, '{971501234567}', 'wrkspc_clinic' from accounts where name = 'Assigned Clinic LLC';
insert into usage_sources (account_id, ai_workspace_id) select id, 'wrkspc_church' from accounts where name = 'Unassigned Church';
insert into usage_import_runs (trigger, rows_written) values ('schedule', 3);
select pg_temp.expect(pg_temp.fails($q$insert into usage_sources (account_id) select account_id from usage_sources limit 1$q$), 'one usage source row per client');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect((select count(*) from usage_sources) = 1, 'staff sees usage sources only on their accounts');
select pg_temp.expect(pg_temp.fails($q$update usage_sources set ai_workspace_id = 'x' returning 1$q$) or (select ai_workspace_id from usage_sources) = 'wrkspc_clinic', 'staff cannot change usage sources');
select pg_temp.expect((select count(*) from usage_import_runs) = 0, 'staff cannot see import runs');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000013';
select pg_temp.expect((select count(*) from usage_import_runs) = 1, 'manager sees import runs');
select pg_temp.expect(pg_temp.fails($q$insert into usage_import_runs (trigger) values ('manual')$q$), 'only the import function logs runs');
select pg_temp.expect(not pg_temp.fails($q$update usage_sources set ai_workspace_id = 'wrkspc_new' where ai_workspace_id = 'wrkspc_church'$q$), 'manager sets usage sources');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect(pg_temp.fails($q$insert into usage_sources (account_id) select id from accounts where name = 'Other Trading House'$q$), 'sales cannot set usage sources');
reset role;

------------------------------------------------------------ Daily digest (roadmap item 4)
insert into digest_recipients (name, email, by_email) values ('Alfred', 'alfred@redreach.ae', true);
insert into digest_runs (run_date, trigger, item_count) values ('2026-11-02', 'schedule', 4);
select pg_temp.expect(pg_temp.fails($q$insert into digest_runs (run_date, trigger) values ('2026-11-02', 'schedule')$q$), 'the schedule sends one digest a day');
select pg_temp.expect(not pg_temp.fails($q$insert into digest_runs (run_date, trigger) values ('2026-11-02', 'manual')$q$), 'send now works on a day the schedule already ran');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect((select count(*) from digest_recipients) = 0, 'staff cannot see the digest list');
select pg_temp.expect(pg_temp.fails($q$insert into digest_recipients (email) values ('someone@example.com')$q$), 'staff cannot join the digest list');
select pg_temp.expect((select count(*) from digest_runs) = 0, 'staff cannot see digest runs');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect((select count(*) from digest_recipients) = 0, 'sales cannot see the digest list');
select pg_temp.expect(pg_temp.fails($q$insert into digest_recipients (email) values ('someone@example.com')$q$), 'sales cannot change the digest list');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000012';
select pg_temp.expect((select count(*) from digest_recipients) = 0, 'viewer cannot see the digest list');
select pg_temp.expect((select count(*) from digest_runs) = 0, 'viewer cannot see digest runs');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000013';
select pg_temp.expect((select count(*) from digest_recipients) = 1, 'manager sees the digest list');
select pg_temp.expect(not pg_temp.fails($q$insert into digest_recipients (name, whatsapp_phone, by_email, by_whatsapp) values ('Ops', '971501234567', false, true)$q$), 'manager adds to the digest list');
select pg_temp.expect(not pg_temp.fails($q$delete from digest_recipients where name = 'Ops'$q$), 'manager removes from the digest list');
select pg_temp.expect((select count(*) from digest_runs) = 2, 'manager sees digest runs');
select pg_temp.expect(pg_temp.fails($q$insert into digest_runs (run_date) values ('2026-11-03')$q$), 'only the digest function logs runs');
reset role;

------------------------------------------------------------ Pre-sale pipeline (roadmap item 5)
insert into accounts (type, name, reference, status) values ('ai_crm_client', 'Prospect Dental', 'AC-07-26090', 'prospect');
insert into sales_deals (account_id, stage, next_action, next_action_date)
  select id, 'lead', 'Book the discovery call', '2026-11-03' from accounts where name = 'Prospect Dental';
insert into sales_deals (account_id, stage, next_action, next_action_date)
  select id, 'discovery_call', 'Send the quote', '2026-11-04' from accounts where name = 'Assigned Clinic LLC';
select pg_temp.expect(pg_temp.fails($q$update sales_deals set stage = 'lost' where next_action = 'Book the discovery call'$q$), 'a lost sales deal needs a reason');
select pg_temp.expect(pg_temp.fails($q$update sales_deals set next_action = '' where next_action = 'Book the discovery call'$q$), 'an open sales deal needs a next action');
select pg_temp.expect(pg_temp.fails($q$update sales_deals set discount_months = 13 where next_action = 'Book the discovery call'$q$), 'discount months stay within a year');
select pg_temp.expect(not pg_temp.fails($q$update sales_deals set stage = 'quote_sent', package_id = (select id from delivery_packages where code = 'growth'), monthly_fee = 4500 where next_action = 'Book the discovery call'$q$), 'a quote goes on the deal');
select id as sales_contract from contracts where account_id = (select id from accounts where name = 'Assigned Clinic LLC') limit 1 \gset
update sales_deals set contract_id = :'sales_contract', stage = 'signed' where next_action = 'Send the quote';
select id as prospect_dental from accounts where name = 'Prospect Dental' \gset
select pg_temp.expect(pg_temp.fails(format('update sales_deals set contract_id = %L where next_action = %L', :'sales_contract', 'Book the discovery call')), 'one sales deal per contract');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect((select count(*) from sales_deals) = 1, 'staff sees sales deals only on their accounts');
select pg_temp.expect(not pg_temp.fails($q$update sales_deals set notes = 'met them' where next_action = 'Send the quote'$q$), 'staff updates their own sales deal');
select pg_temp.expect(pg_temp.fails(format('insert into sales_deals (account_id, next_action, next_action_date) values (%L, %L, %L)', :'prospect_dental', 'x', '2026-12-01')), 'staff cannot add deals on other accounts');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect((select count(*) from sales_deals) = 2, 'sales sees every sales deal');
select pg_temp.expect(not pg_temp.fails($q$update sales_deals set next_action = 'Chase the signature' where next_action = 'Book the discovery call'$q$), 'sales moves sales deals');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000012';
select pg_temp.expect((select count(*) from sales_deals) = 2, 'viewer reads sales deals');
select pg_temp.expect(pg_temp.fails(format('insert into sales_deals (account_id, next_action, next_action_date) values (%L, %L, %L)', :'prospect_dental', 'x', '2026-12-01')), 'viewer cannot add sales deals');
reset role;

set role anon;
select pg_temp.expect(pg_temp.fails('select 1 from sales_deals'), 'anon cannot read sales deals');
reset role;

------------------------------------------------------------ Client portal (roadmap item 6)
insert into portal_access (account_id, label, token_hash)
  select id, 'Dr Prospect', md5('prospect') || md5('prospect-2') from accounts where name = 'Prospect Dental';
insert into portal_access (account_id, label, token_hash)
  select id, 'Clinic team', md5('clinic') || md5('clinic-2') from accounts where name = 'Assigned Clinic LLC';
select id as assigned_clinic from accounts where name = 'Assigned Clinic LLC' \gset
select pg_temp.expect(pg_temp.fails(format('insert into portal_access (account_id, token_hash) values (%L, %L)', :'prospect_dental', 'not-a-hash')), 'portal links keep only a hash');
select pg_temp.expect(pg_temp.fails(format('insert into portal_access (account_id, token_hash) values (%L, %L)', :'prospect_dental', md5('prospect') || md5('prospect-2'))), 'each portal link is unique');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect((select count(*) from portal_access) = 1, 'staff sees portal links only on their accounts');
select pg_temp.expect(not pg_temp.fails(format('insert into portal_access (account_id, label, token_hash) values (%L, %L, %L)', :'assigned_clinic', 'Front desk', md5('desk') || md5('desk-2'))), 'staff makes a portal link on their account');
select pg_temp.expect(not pg_temp.fails($q$update portal_access set revoked_at = now() where label = 'Front desk'$q$), 'staff turns off a portal link');
select pg_temp.expect(pg_temp.fails(format('insert into portal_access (account_id, token_hash) values (%L, %L)', :'prospect_dental', md5('x') || md5('y'))), 'staff cannot make links on other accounts');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000012';
select pg_temp.expect((select count(*) from portal_access) = 3, 'viewer reads portal links');
select pg_temp.expect(pg_temp.fails(format('insert into portal_access (account_id, token_hash) values (%L, %L)', :'assigned_clinic', md5('v') || md5('w'))), 'viewer cannot make portal links');
reset role;

set role anon;
select pg_temp.expect(pg_temp.fails('select 1 from portal_access'), 'anon cannot read portal links');
reset role;

------------------------------------------------------------ AI help (roadmap item 7)
insert into ai_usage_log (account_id, feature, model, input_tokens, output_tokens, cost_usd)
  values (:'assigned_clinic', 'ticket_summary', 'claude-haiku-5-5', 1200, 200, 0.00022),
         (:'prospect_dental', 'call_notes', 'claude-haiku-5-5', 900, 300, 0.00024);
select pg_temp.expect(pg_temp.fails(format('insert into ai_usage_log (account_id, feature) values (%L, %L)', :'prospect_dental', 'write_poems')), 'AI use is logged only for known features');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect((select count(*) from ai_usage_log) = 1, 'staff sees AI use only on their accounts');
select pg_temp.expect(pg_temp.fails(format('insert into ai_usage_log (account_id, feature) values (%L, %L)', :'assigned_clinic', 'ticket_reply')), 'staff cannot write the AI log');
select pg_temp.expect(pg_temp.fails($q$update ai_usage_log set cost_usd = 0$q$) or (select sum(cost_usd) from ai_usage_log) > 0, 'staff cannot change AI cost');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000013';
select pg_temp.expect((select count(*) from ai_usage_log) = 2, 'manager sees all AI use');
select pg_temp.expect(pg_temp.fails($q$delete from ai_usage_log$q$) or (select count(*) from ai_usage_log) = 2, 'manager cannot delete the AI log');
reset role;

set role anon;
select pg_temp.expect(pg_temp.fails('select 1 from ai_usage_log'), 'anon cannot read AI use');
reset role;

------------------------------------------------------------ WhatsApp to tickets (roadmap item 8)
insert into tickets (account_id, requester_phone, subject, channel, sla_hours)
  values (:'assigned_clinic', '971501234567', 'Reminders stopped', 'whatsapp', 8);
select id as wa_ticket from tickets where requester_phone = '971501234567' \gset
insert into ticket_messages (ticket_id, author_kind, author_label, body, external_id)
  values (:'wa_ticket', 'contact', 'Sara (WhatsApp +971501234567)', 'Reminders stopped', 'wamid.TEST1');
select pg_temp.expect(pg_temp.fails(format('insert into ticket_messages (ticket_id, author_kind, author_label, body, external_id) values (%L, %L, %L, %L, %L)', :'wa_ticket', 'contact', 'Sara', 'again', 'wamid.TEST1')), 'a WhatsApp message is saved once');
select pg_temp.expect(not pg_temp.fails(format('insert into ticket_messages (ticket_id, author_kind, author_label, body) values (%L, %L, %L, %L)', :'wa_ticket', 'user', 'alfred', 'note one')) and not pg_temp.fails(format('insert into ticket_messages (ticket_id, author_kind, author_label, body) values (%L, %L, %L, %L)', :'wa_ticket', 'user', 'alfred', 'note two')), 'messages without a WhatsApp id are not limited');
select pg_temp.expect(pg_temp.fails($q$update ticket_messages set delivery_status = 'bounced' where external_id = 'wamid.TEST1'$q$), 'delivery status is one of the WhatsApp states');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect((select count(*) from tickets where requester_phone = '971501234567') = 1, 'staff sees WhatsApp tickets on their accounts');
reset role;

------------------------------------------------------------ Build templates (roadmap item 9)
select pg_temp.expect((select count(*) from build_templates) = 3, 'three starter build templates');
select pg_temp.expect((select count(*) from build_templates t join delivery_packages p on p.id = t.package_id) = 3, 'each starter template is linked to its package');
select pg_temp.expect((select sum(est_hours) from build_template_items i join build_templates t on t.id = i.template_id where t.code = 'starter' and i.kind = 'task') between 10 and 14, 'starter build is about 12 hours');
select pg_temp.expect(pg_temp.fails($q$insert into build_template_items (template_id, kind, title) select id, 'task', 'No stage' from build_templates where code = 'starter'$q$), 'a template task needs a build stage');
insert into build_tasks (account_id, stage, title, est_hours) values (:'assigned_clinic', 'build', 'Import contacts', 1.5);
insert into build_tasks (account_id, stage, title, est_hours) values (:'prospect_dental', 'discovery', 'Kick-off call', 1);

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect((select count(*) from build_templates) = 3, 'staff reads build templates');
select pg_temp.expect(pg_temp.fails($q$insert into build_templates (code, name) values ('va', 'VA build')$q$), 'staff cannot add build templates');
select pg_temp.expect((select count(*) from build_tasks) = 1, 'staff sees the build checklist only on their accounts');
select pg_temp.expect(not pg_temp.fails($q$update build_tasks set done = true, done_at = now() where title = 'Import contacts'$q$), 'staff ticks off a build task');
select pg_temp.expect(not pg_temp.fails(format('insert into build_tasks (account_id, stage, title) values (%L, %L, %L)', :'assigned_clinic', 'testing', 'Test the form')), 'staff adds a build task on their account');
select pg_temp.expect(pg_temp.fails(format('insert into build_tasks (account_id, stage, title) values (%L, %L, %L)', :'prospect_dental', 'testing', 'x')), 'staff cannot add build tasks on other accounts');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect(pg_temp.fails($q$update build_templates set name = 'Changed' where code = 'starter'$q$) or (select name from build_templates where code = 'starter') = 'Starter build', 'sales cannot change build templates');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000012';
select pg_temp.expect((select count(*) from build_tasks) = 3, 'viewer reads build checklists');
select pg_temp.expect(pg_temp.fails(format('insert into build_tasks (account_id, stage, title) values (%L, %L, %L)', :'assigned_clinic', 'live', 'x')), 'viewer cannot add build tasks');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000013';
select pg_temp.expect(not pg_temp.fails($q$insert into build_templates (code, name) values ('clinic', 'Clinic build')$q$), 'manager adds a build template');
select pg_temp.expect(not pg_temp.fails($q$insert into build_template_items (template_id, kind, stage, title, est_hours) select id, 'task', 'build', 'Booking calendar', 2 from build_templates where code = 'clinic'$q$), 'manager adds a template line');
select pg_temp.expect(not pg_temp.fails($q$delete from build_templates where code = 'clinic'$q$), 'manager removes a build template');
reset role;

set role anon;
select pg_temp.expect(pg_temp.fails('select 1 from build_templates'), 'anon cannot read build templates');
select pg_temp.expect(pg_temp.fails('select 1 from build_tasks'), 'anon cannot read build checklists');
reset role;

------------------------------------------------------------ Agreement templates (roadmap item 10)
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000013';
select pg_temp.expect(not pg_temp.fails($q$insert into agreement_templates (version, body) values (1, '# Agreement {{client_name}}')$q$), 'manager saves a draft agreement template');
select pg_temp.expect(not pg_temp.fails($q$update agreement_templates set body = '# Agreement for {{client_name}}' where version = 1$q$), 'manager edits a draft');
select pg_temp.expect(pg_temp.fails($q$update agreement_templates set status = 'approved' where version = 1$q$), 'approval needs the lawyer name and date');
select pg_temp.expect(not pg_temp.fails($q$update agreement_templates set status = 'approved', approved_by = 'Layla Haddad', approved_at = now() where version = 1$q$), 'manager records the lawyer approval');
select pg_temp.expect(pg_temp.fails($q$update agreement_templates set body = 'changed' where version = 1$q$), 'approved wording is locked');
select pg_temp.expect(pg_temp.fails($q$delete from agreement_templates where version = 1$q$), 'approved template cannot be deleted');
select pg_temp.expect(not pg_temp.fails($q$insert into agreement_templates (version, body) values (2, '# Agreement v2')$q$), 'manager starts a new draft');
select pg_temp.expect(pg_temp.fails($q$update agreement_templates set status = 'approved', approved_by = 'L', approved_at = now() where version = 2$q$), 'only one approved version at a time');
select pg_temp.expect(not pg_temp.fails($q$update agreement_templates set status = 'retired' where version = 1$q$), 'old version is retired');
select pg_temp.expect(not pg_temp.fails($q$update agreement_templates set status = 'approved', approved_by = 'L', approved_at = now() where version = 2$q$), 'new version approved after the old one is retired');
select pg_temp.expect(pg_temp.fails($q$update agreement_templates set status = 'approved' where version = 1$q$), 'a retired version cannot come back');
select pg_temp.expect(not pg_temp.fails($q$insert into agreement_templates (version, body) values (3, 'draft 3')$q$) and not pg_temp.fails($q$delete from agreement_templates where version = 3$q$), 'manager deletes a draft');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect((select count(*) from agreement_templates) = 2, 'staff reads agreement templates');
select pg_temp.expect(pg_temp.fails($q$insert into agreement_templates (version, body) values (9, 'x')$q$), 'staff cannot add agreement templates');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect((select count(*) from agreement_templates) = 2, 'sales reads agreement templates');
select pg_temp.expect(pg_temp.fails($q$insert into agreement_templates (version, body) values (9, 'x')$q$), 'sales cannot add agreement templates');
reset role;

set role anon;
select pg_temp.expect(pg_temp.fails('select 1 from agreement_templates'), 'anon cannot read agreement templates');
reset role;

------------------------------------------------------------ Report calls (Tier 4 health score)
insert into report_calls (account_id, month, status) values (:'prospect_dental', '2026-10-01', 'attended');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect(not pg_temp.fails(format('insert into report_calls (account_id, month, status) values (%L, %L, %L)', :'assigned_clinic', '2026-10-01', 'missed')), 'staff records a report call on their account');
select pg_temp.expect(not pg_temp.fails(format('update report_calls set status = %L where account_id = %L', 'attended', :'assigned_clinic')), 'staff changes it');
select pg_temp.expect(pg_temp.fails(format('insert into report_calls (account_id, month, status) values (%L, %L, %L)', :'assigned_clinic', '2026-10-01', 'missed')), 'one report call per client per month');
select pg_temp.expect(pg_temp.fails(format('insert into report_calls (account_id, month, status) values (%L, %L, %L)', :'assigned_clinic', '2026-09-15', 'missed')), 'month is the first of the month');
select pg_temp.expect(pg_temp.fails(format('insert into report_calls (account_id, month, status) values (%L, %L, %L)', :'prospect_dental', '2026-09-01', 'missed')), 'staff cannot record on other accounts');
select pg_temp.expect((select count(*) from report_calls) = 1, 'staff sees report calls only on their accounts');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000012';
select pg_temp.expect((select count(*) from report_calls) = 2, 'viewer reads report calls');
select pg_temp.expect(pg_temp.fails(format('insert into report_calls (account_id, month, status) values (%L, %L, %L)', :'assigned_clinic', '2026-08-01', 'missed')), 'viewer cannot record report calls');
reset role;

set role anon;
select pg_temp.expect(pg_temp.fails('select 1 from report_calls'), 'anon cannot read report calls');
reset role;

------------------------------------------------------------ Audit log on contracts, prices and commission (roadmap item 11)
update contracts set monthly_fee = monthly_fee + 1 where account_id = :'assigned_clinic';
select pg_temp.expect(exists (
  select 1 from audit_log where table_name = 'contracts' and operation = 'UPDATE'
    and 'monthly_fee' = any(changed_fields) and account_id = :'assigned_clinic'
), 'a contract fee change is logged against its account');
select pg_temp.expect(exists (
  select 1 from pg_trigger where tgname = 'rr_audit' and tgrelid = 'public.line_items'::regclass
), 'quote and invoice lines are audited');
select pg_temp.expect(exists (
  select 1 from pg_trigger where tgname = 'rr_audit' and tgrelid = 'public.ctrm_deal_commissions'::regclass
), 'commission is audited');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000013';
select pg_temp.expect((select count(*) from audit_log) = 0, 'manager cannot read the audit log');
select pg_temp.expect(pg_temp.fails($q$update audit_log set actor_email = 'someone@else'$q$) or not exists (select 1 from audit_log), 'manager cannot change the audit log');
reset role;

------------------------------------------------------------ Two step sign in and error monitoring (roadmap item 14)
insert into auth.mfa_factors (user_id, status) values ('00000000-0000-0000-0000-00000000000a', 'verified');
insert into auth.mfa_factors (user_id, status) values ('00000000-0000-0000-0000-000000000013', 'unverified');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect((select has_two_step from rr_team_two_step() where email = 'alfred@redreach.ae'), 'admin sees their own two step sign in');
select pg_temp.expect(not (select has_two_step from rr_team_two_step() where email = 'manager@redreach.ae'), 'an unfinished set up does not count');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect((select count(*) from rr_team_two_step()) = 0, 'staff cannot see who has two step sign in');
select pg_temp.expect(not pg_temp.fails($q$insert into app_errors (message, user_email) values ('Save failed', 'someone@else.com')$q$), 'a team member reports an error');
select pg_temp.expect((select count(*) from app_errors) = 0, 'staff cannot read errors');
select pg_temp.expect(pg_temp.fails($q$insert into app_errors (message, kind) values ('x', 'nonsense')$q$), 'error kinds are fixed');
reset role;

select pg_temp.expect((select user_email from app_errors where message = 'Save failed') = 'va@redreach.ae', 'the error is stamped with who hit it, not what the browser said');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect((select count(*) from app_errors) = 1, 'admin reads errors');
select pg_temp.expect(pg_temp.fails($q$update app_errors set message = 'edited'$q$) or (select message from app_errors limit 1) = 'Save failed', 'nobody edits a reported error');
select pg_temp.expect(not pg_temp.fails($q$delete from app_errors$q$), 'admin clears errors');
reset role;

set role anon;
select pg_temp.expect(pg_temp.fails($q$insert into app_errors (message) values ('spam')$q$), 'anon cannot report errors');
reset role;

------------------------------------------------------------ Daily watchdog (Wave 2, PR F)
insert into watch_items (key, kind, severity, title, owner_user_id)
  values ('stale_deal:ctrm:1', 'stale_deal', 'warning', 'Admin deal', (select id from app_users where email = 'alfred@redreach.ae')),
         ('over_hours:va', 'over_hours', 'urgent', 'VA client', (select id from app_users where email = 'va@redreach.ae'));
select pg_temp.expect(pg_temp.fails($q$insert into watch_items (key, kind) values ('stale_deal:ctrm:1', 'stale_deal')$q$), 'one watch item per key');
select pg_temp.expect(pg_temp.fails($q$insert into watch_items (key, kind) values ('x', 'nonsense')$q$), 'watch item kinds are fixed');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect((select count(*) from watch_items) = 2, 'admin reads every watch item');
select pg_temp.expect(pg_temp.fails($q$insert into watch_items (key, kind) values ('y', 'renewal')$q$), 'admin cannot add watch items from the app');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000013';
select pg_temp.expect((select count(*) from watch_items) = 2, 'manager reads every watch item');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect((select count(*) from watch_items) = 2, 'sales reads every watch item');
select pg_temp.expect(pg_temp.fails($q$update watch_items set cleared_at = now() returning 1$q$) or (select count(*) from watch_items where cleared_at is not null) = 0, 'sales cannot clear watch items');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect((select count(*) from watch_items) = 1, 'staff sees only their own watch items');
select pg_temp.expect((select title from watch_items) = 'VA client', 'staff sees the right watch item');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000012';
select pg_temp.expect((select count(*) from watch_items) = 2, 'viewer reads watch items');
select pg_temp.expect(pg_temp.fails($q$delete from watch_items returning 1$q$) or (select count(*) from watch_items) = 2, 'viewer cannot delete watch items');
reset role;

set role anon;
select pg_temp.expect(pg_temp.fails('select 1 from watch_items'), 'anon cannot read watch items');
reset role;

------------------------------------------------------------ My deals: when each deal reached its stage (Wave 3, PR H)
alter table ctrm_deals disable trigger rr_stage_changed_at;
update ctrm_deals set stage_changed_at = '2020-01-01';
alter table ctrm_deals enable trigger rr_stage_changed_at;
alter table crm disable trigger rr_stage_changed_at;
update crm set stage_changed_at = '2020-01-01';
alter table crm enable trigger rr_stage_changed_at;

update ctrm_deals set notes = 'touched' where region = 'middle_east';
select pg_temp.expect((select stage_changed_at from ctrm_deals where region = 'middle_east') = '2020-01-01', 'saving without a stage move keeps stage_changed_at');
update ctrm_deals set stage_changed_at = '2025-05-05' where region = 'middle_east';
select pg_temp.expect((select stage_changed_at from ctrm_deals where region = 'middle_east') = '2020-01-01', 'stage_changed_at cannot be set by hand');
insert into crm (company_name, pipeline_stage) values ('Stage Clock Co', 'Lead');
select pg_temp.expect((select stage_changed_at from crm where company_name = 'Stage Clock Co') is not null, 'a new CRM lead starts its stage clock');
alter table crm disable trigger rr_stage_changed_at;
update crm set stage_changed_at = '2020-01-01' where company_name = 'Stage Clock Co';
alter table crm enable trigger rr_stage_changed_at;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
update ctrm_deals set stage = 'intro_call_booked', next_action = 'Call', next_action_date = '2026-11-03' where region = 'india';
select pg_temp.expect((select stage_changed_at from ctrm_deals where region = 'india') > '2020-01-01', 'staff moving their deal restarts its stage clock');
select pg_temp.expect((select count(*) from ctrm_deals where stage_changed_at is not null) = 1, 'staff reads stage times only on their own deals');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
update crm set pipeline_stage = 'Contacted', next_action = 'Call', follow_up_date = '2026-11-03' where company_name = 'Stage Clock Co';
reset role;
select pg_temp.expect((select pipeline_stage from crm where company_name = 'Stage Clock Co') = 'Contacted', 'sales moves a CRM lead');
select pg_temp.expect((select count(*) from crm where stage_changed_at > '2020-01-01') = 1, 'only the moved CRM lead restarts its stage clock');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000012';
select pg_temp.expect((select count(*) from ctrm_deals where stage_changed_at is not null) = 2, 'viewer reads stage times');
select pg_temp.expect((select count(*) from ctrm_deal_commissions) = 0, 'viewer still sees no commission for My deals');
update ctrm_deals set stage = 'lost', lost_reason = 'x';
reset role;
select pg_temp.expect((select count(*) from ctrm_deals where stage = 'lost') = 0, 'viewer cannot move deals');
------------------------------------------------------------ Next step and lost reason on every move (Wave 3, PR I)
insert into crm (company_name, pipeline_stage) values ('No Step Co', 'Lead');
select pg_temp.expect(not pg_temp.fails($q$update crm set notes = 'still no next step' where company_name = 'No Step Co'$q$), 'a deal without a next step can still be edited');
select pg_temp.expect(pg_temp.fails($q$update crm set pipeline_stage = 'Contacted' where company_name = 'No Step Co'$q$), 'CRM move to an open stage needs a next action');
select pg_temp.expect(pg_temp.fails($q$update crm set pipeline_stage = 'Contacted', next_action = 'Call' where company_name = 'No Step Co'$q$), 'CRM move to an open stage needs a date');
select pg_temp.expect(pg_temp.fails($q$update crm set pipeline_stage = 'Lost', outcome_reason = 'They went quiet', lost_note = 'x' where company_name = 'No Step Co'$q$), 'CRM lost reason must come from the list');
select pg_temp.expect(pg_temp.fails($q$update crm set pipeline_stage = 'Lost', outcome_reason = 'Price' where company_name = 'No Step Co'$q$), 'CRM lost needs a note');
select pg_temp.expect(not pg_temp.fails($q$update crm set pipeline_stage = 'Won', outcome_reason = 'Relationship' where company_name = 'No Step Co'$q$), 'CRM won needs no next step');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect(not pg_temp.fails($q$update crm set pipeline_stage = 'Lost', outcome_reason = 'Price', lost_note = 'Too dear for them this year' where company_name = 'No Step Co'$q$), 'sales marks a CRM deal lost with a reason and note');
select pg_temp.expect(pg_temp.fails($q$update ctrm_deals set stage = 'lost', lost_reason = 'Chose another vendor', lost_reason_code = '' where region = 'middle_east'$q$), 'sales cannot lose a CTRM deal without a listed reason');
select pg_temp.expect(not pg_temp.fails($q$update ctrm_deals set stage = 'intro_call_booked', next_action = 'Send proposal', next_action_date = '2026-11-20' where region = 'middle_east'$q$), 'sales moves a CTRM deal with a next step');
reset role;
select pg_temp.expect((select pipeline_stage from crm where company_name = 'No Step Co') = 'Lost', 'the CRM deal is lost');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect(pg_temp.fails($q$update ctrm_deals set stage = 'lost', lost_reason = 'Gone', lost_reason_code = 'Nope' where region = 'india'$q$), 'staff cannot lose their deal with an unlisted reason');
select pg_temp.expect(not pg_temp.fails($q$update ctrm_deals set stage = 'lost', lost_reason = 'Chose an in-house tool', lost_reason_code = 'Competitor won' where region = 'india'$q$), 'staff loses their own deal with a reason and note');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000012';
update crm set pipeline_stage = 'Lead', next_action = 'x', follow_up_date = '2026-12-01' where company_name = 'No Step Co';
reset role;
select pg_temp.expect((select pipeline_stage from crm where company_name = 'No Step Co') = 'Lost', 'viewer cannot reopen a deal');
------------------------------------------------------------ Lead intake (Wave 3, PR J)
-- The website can still post an enquiry, but only lead-intake (service key)
-- may link it to an account or deal, set its owner or mark it matched.
-- Rate limit window: clear earlier anon inserts so these are not refused for volume.
delete from website_inquiries;
insert into website_inquiries (name, email, status, channel, pipeline, source, utm_source, account_id, deal_id, matched, crm_id, created_at)
  values ('Intake Lead', 'lead@x.com', 'converted', 'landing_page', 'ai_crm', 'AI CRM landing page, google', 'google',
          (select id from accounts where reference = 'AC-07-26001'), 'deal-1', true, '', now());
set role anon;
select pg_temp.expect(not pg_temp.fails($q$insert into website_inquiries (name, email, message, utm_source, utm_campaign, page_url) values ('Visitor', 'v@x.com', 'hi', 'google', 'q4', 'https://redreach.ae/contact')$q$), 'anon can submit a form with UTM values');
select pg_temp.expect(pg_temp.fails($q$insert into website_inquiries (name, email, matched) values ('X', 'x@x.com', true)$q$), 'anon cannot mark an enquiry as matched');
select pg_temp.expect(pg_temp.fails($q$insert into website_inquiries (name, email, deal_id) values ('X', 'x@x.com', 'deal-1')$q$), 'anon cannot link an enquiry to a deal');
select pg_temp.expect(pg_temp.fails($q$insert into website_inquiries (name, email, channel) values ('X', 'x@x.com', 'landing_page')$q$), 'anon cannot claim another channel');
select pg_temp.expect(pg_temp.fails($q$insert into website_inquiries (name, email, ip_hash) values ('X', 'x@x.com', 'abc')$q$), 'anon cannot set the sender hash');
select pg_temp.expect(pg_temp.fails($q$insert into website_inquiries (name, email, utm_source) values ('X', 'x@x.com', repeat('u', 300))$q$), 'anon UTM length capped');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect((select count(*) from website_inquiries where source like 'AI CRM landing page%') = 1, 'admin reads new leads with their source');
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000013';
select pg_temp.expect((select count(*) from website_inquiries where matched) = 1, 'manager reads new leads');
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect((select count(*) from website_inquiries where deal_id = 'deal-1') = 1, 'sales reads new leads');
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect((select count(*) from website_inquiries) = 0, 'staff (VA) does not see leads');
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000012';
select pg_temp.expect((select count(*) from website_inquiries) = 0, 'viewer does not see leads');
reset role;

------------------------------------------------------------ Quote accept link (Wave 3, PR K)
insert into quotations (id, client, reference_number, status) values ('00000000-0000-0000-0000-0000000000e1', 'Accept Co', 'RR-07-26901', 'Sent');
insert into quote_accept_links (id, quotation_id, token_hash, accepted_at, accepted_name) values
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e1', repeat('a', 64), now(), 'Sara Khan');
insert into quote_accept_pdfs (link_id, pdf_base64) values ('00000000-0000-0000-0000-0000000000e2', 'JVBERi0=');
insert into quote_acceptances (link_id, quotation_id, accepted_name, accepted_date, ip) values
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e1', 'Sara Khan', current_date, '203.0.113.9');

set role anon;
select pg_temp.expect(pg_temp.fails('select 1 from quote_accept_links'), 'anon cannot read accept links');
select pg_temp.expect(pg_temp.fails('select 1 from quote_accept_pdfs'), 'anon cannot read accept PDFs');
select pg_temp.expect(pg_temp.fails('select 1 from quote_acceptances'), 'anon cannot read acceptances');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect((select count(*) from quote_acceptances where ip = '203.0.113.9') = 1, 'admin sees who accepted, when and from where');
select pg_temp.expect(not pg_temp.fails($q$insert into quote_accept_links (quotation_id, token_hash) values ('00000000-0000-0000-0000-0000000000e1', repeat('b', 64))$q$), 'admin can make an accept link');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000013';
select pg_temp.expect((select count(*) from quote_accept_links where accepted_name = 'Sara Khan') = 1, 'manager sees that the quote was accepted');
select pg_temp.expect((select count(*) from quote_acceptances) = 0, 'manager does not see the full acceptance record');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect(not pg_temp.fails($q$insert into quote_accept_links (quotation_id, token_hash) values ('00000000-0000-0000-0000-0000000000e1', repeat('c', 64))$q$), 'sales can make an accept link');
select pg_temp.expect(pg_temp.fails($q$insert into quote_accept_links (quotation_id, token_hash, accepted_at, accepted_name) values ('00000000-0000-0000-0000-0000000000e1', repeat('d', 64), now(), 'Forged')$q$), 'sales cannot make a link that is already accepted');
select pg_temp.expect(pg_temp.fails($q$update quote_accept_links set accepted_name = 'Forged' where token_hash = repeat('c', 64) returning 1$q$) or (select count(*) from quote_accept_links where accepted_name = 'Forged') = 0, 'sales cannot mark a link accepted');
update quote_accept_links set revoked_at = now() where token_hash = repeat('c', 64);
select pg_temp.expect((select revoked_at is not null from quote_accept_links where token_hash = repeat('c', 64)), 'sales can turn a link off');
update quote_accept_links set revoked_at = now() where accepted_at is not null;
select pg_temp.expect((select revoked_at is null from quote_accept_links where accepted_name = 'Sara Khan'), 'an accepted link cannot be changed');
select pg_temp.expect((select count(*) from quote_acceptances) = 0, 'sales does not see the full acceptance record');
select pg_temp.expect(pg_temp.fails($q$delete from quote_accept_links returning 1$q$) or (select count(*) from quote_accept_links) = 3, 'sales cannot delete accept links');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect((select count(*) from quote_accept_links) = 0, 'staff (VA) does not see accept links');
select pg_temp.expect(pg_temp.fails($q$insert into quote_accept_links (quotation_id, token_hash) values ('00000000-0000-0000-0000-0000000000e1', repeat('e', 64))$q$), 'staff (VA) cannot make accept links');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000012';
select pg_temp.expect((select count(*) from quote_accept_pdfs) = 0, 'viewer does not see accept PDFs');
select pg_temp.expect(pg_temp.fails($q$insert into quote_accept_links (quotation_id, token_hash) values ('00000000-0000-0000-0000-0000000000e1', repeat('f', 64))$q$), 'viewer cannot make accept links');
reset role;

------------------------------------------------------------ Follow up templates and nudges (Wave 3, PR L)
insert into message_templates (name, channel, body) values ('Seed', 'whatsapp', 'Hi {{name}}');
insert into quotations (id, client, reference_number, status, updated_at) values ('00000000-0000-0000-0000-0000000000f1', 'Nudge Co', 'RR-03-26991', 'Finalized', now() - interval '9 days');
update quotations set status = 'Sent' where id = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.expect((select sent_at > now() - interval '1 minute' from quotations where id = '00000000-0000-0000-0000-0000000000f1'), 'marking a quote Sent records when');
update quotations set notes = 'still sent' where id = '00000000-0000-0000-0000-0000000000f1';
update quotations set sent_at = now() - interval '5 days' where id = '00000000-0000-0000-0000-0000000000f1';
update quotations set notes = 'edited again' where id = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.expect((select sent_at < now() - interval '4 days' from quotations where id = '00000000-0000-0000-0000-0000000000f1'), 'editing a sent quote keeps when it was sent');

set role anon;
select pg_temp.expect(pg_temp.fails('select 1 from message_templates'), 'anon cannot read templates');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect(not pg_temp.fails($q$insert into message_templates (name, channel, division_code, body) values ('Admin', 'email', '01', 'x')$q$), 'admin can add a template');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000013';
select pg_temp.expect(not pg_temp.fails($q$update message_templates set body = 'Hello {{name}}' where name = 'Seed' returning 1$q$), 'manager can edit a template');
select pg_temp.expect(pg_temp.fails($q$insert into message_templates (name, channel, division_code, body) values ('Bad', 'whatsapp', 'x1', 'x')$q$), 'a template needs a real division code');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect((select count(*) from message_templates) = 2, 'sales reads the templates');
select pg_temp.expect(pg_temp.fails($q$insert into message_templates (name, channel, body) values ('Sales', 'whatsapp', 'x')$q$), 'sales cannot add templates');
update message_templates set body = 'changed by sales';
select pg_temp.expect((select count(*) from message_templates where body = 'changed by sales') = 0, 'sales cannot edit templates');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect((select count(*) from message_templates) = 0, 'staff (VA) does not see templates');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000012';
select pg_temp.expect((select count(*) from message_templates) = 0, 'viewer does not see templates');
select pg_temp.expect(pg_temp.fails($q$insert into message_templates (name, channel, body) values ('V', 'whatsapp', 'x')$q$), 'viewer cannot add templates');
reset role;

------------------------------------------------------------ Fireflies calls on the timeline (Wave 3, PR M)
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect(not pg_temp.fails($q$insert into account_activities (account_id, kind, body, external_source, external_id) select id, 'meeting', 'Fireflies: call', 'fireflies', 'FF1' from accounts where name = 'Assigned Clinic LLC'$q$), 'staff (VA) can add a Fireflies call on their own account');
select pg_temp.expect(pg_temp.fails($q$insert into account_activities (account_id, kind, body, external_source, external_id) select id, 'meeting', 'again', 'fireflies', 'FF1' from accounts where name = 'Assigned Clinic LLC'$q$), 'the same Fireflies call cannot be added twice');
-- The VA cannot even see the other account; a guessed id is refused by RLS.
reset role;
select set_config('rr.test_church', (select id::text from accounts where name = 'Unassigned Church'), false);
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect(pg_temp.fails($q$insert into account_activities (account_id, kind, body, external_source, external_id) values (current_setting('rr.test_church')::uuid, 'meeting', 'x', 'fireflies', 'FF2')$q$), 'staff (VA) cannot add a call on an account they do not have');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect(not pg_temp.fails($q$insert into account_activities (account_id, kind, body, external_source, external_id) select id, 'meeting', 'Fireflies: call', 'fireflies', 'FF1' from accounts where name = 'Unassigned Church'$q$), 'the same call can go on a different account');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000013';
select pg_temp.expect((select count(*) from account_activities where external_source = 'fireflies') = 2, 'manager sees the Fireflies calls');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect((select count(*) from account_activities where external_id = 'FF1') = 2, 'admin sees the Fireflies calls');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000012';
select pg_temp.expect(pg_temp.fails($q$insert into account_activities (account_id, kind, body, external_source, external_id) select id, 'meeting', 'v', 'fireflies', 'FF9' from accounts limit 1$q$), 'viewer cannot add a Fireflies call');
reset role;

set role anon;
select pg_temp.expect(pg_temp.fails('select 1 from account_activities'), 'anon cannot read the timeline');
reset role;

------------------------------------------------------------ Card payments (Wave 3, PR N)
insert into quotations (client, reference_number, status, quotation_currency) values ('Dollar Co', 'RR-06-26950', 'Awarded', 'USD');
insert into invoices (client, reference_number, amount, status) values ('Dollar Co', 'RR-06-26950', 1200, 'Sent');
insert into payment_log (invoice_ref, client, amount) values ('RR-06-26950', 'Dollar Co', 200);
-- Run the card payments migration again: the backfill must be safe to repeat.
\i migrations/20261119090000_invoice_pay_link.sql
select pg_temp.expect((select currency from invoices where reference_number = 'RR-06-26950') = 'USD', 'an invoice from a USD quote is in USD');
select pg_temp.expect((select currency from payment_log where invoice_ref = 'RR-06-26950') = 'USD', 'earlier payments take the invoice currency');
select pg_temp.expect((select currency from invoices where reference_number = 'RR-1') = 'AED', 'other invoices stay AED');
insert into payment_log (invoice_ref, client, amount, currency, external_ref) values ('RR-06-26950', 'Dollar Co', 1000, 'USD', 'cs_test_1');
select pg_temp.expect(pg_temp.fails($q$insert into payment_log (invoice_ref, client, amount, external_ref) values ('RR-06-26950', 'Dollar Co', 1000, 'cs_test_1')$q$), 'the same Stripe payment is recorded once');

set role anon;
select pg_temp.expect(pg_temp.fails('select 1 from payment_log'), 'anon cannot read payments');
select pg_temp.expect(pg_temp.fails('select pay_link_url from invoices'), 'anon cannot read payment links');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect((select count(*) from payment_log where external_ref = 'cs_test_1') = 1, 'admin sees card payments');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect((select count(*) from payment_log where currency = 'USD') = 2, 'sales sees payments with their currency');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect((select count(*) from payment_log) = 0, 'staff (VA) does not see payments');
select pg_temp.expect((select count(*) from invoices where reference_number = 'RR-06-26950') = 0, 'staff (VA) does not see the invoice or its link');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000012';
select pg_temp.expect(pg_temp.fails($q$insert into payment_log (invoice_ref, amount, external_ref) values ('RR-06-26950', 1, 'cs_forged')$q$), 'viewer cannot record a payment');
reset role;

------------------------------------------------------------ Files from the client portal (Wave 4, PR P)
insert into portal_uploads (account_id, filename, size_bytes, content_base64)
  select id, 'menu.pdf', 10, 'aGVsbG8=' from accounts where name = 'Assigned Clinic LLC';
insert into portal_uploads (account_id, filename, size_bytes, content_base64)
  select id, 'other.pdf', 10, 'aGVsbG8=' from accounts where name = 'Prospect Dental';
select pg_temp.expect(pg_temp.fails($q$insert into portal_uploads (account_id, filename, size_bytes) select id, 'big.pdf', 6000000 from accounts limit 1$q$), 'uploads over 5 MB are refused');
select pg_temp.expect(pg_temp.fails($q$insert into portal_uploads (account_id, filename, size_bytes, status) select id, 'a.pdf', 1, 'lost' from accounts limit 1$q$), 'upload status is checked');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect((select count(*) from portal_uploads) = 1, 'staff (VA) sees uploads only on their accounts');
select pg_temp.expect(not pg_temp.fails($q$update portal_uploads set status = 'in_workdrive', content_base64 = '' where filename = 'menu.pdf'$q$), 'staff (VA) marks an upload filed');
select pg_temp.expect((select status from portal_uploads where filename = 'menu.pdf') = 'in_workdrive', 'the upload is filed');
select pg_temp.expect(pg_temp.fails($q$insert into portal_uploads (account_id, filename, size_bytes) select id, 'x.pdf', 1 from accounts where name = 'Assigned Clinic LLC'$q$), 'staff (VA) cannot add uploads: only the portal does');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect((select count(*) from portal_uploads) = 2, 'sales sees uploads');
select pg_temp.expect(pg_temp.fails($q$insert into portal_uploads (account_id, filename, size_bytes) select id, 'x.pdf', 1 from accounts limit 1$q$), 'sales cannot add uploads');
delete from portal_uploads where filename = 'other.pdf';
select pg_temp.expect((select count(*) from portal_uploads) = 2, 'sales cannot delete uploads');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000013';
select pg_temp.expect((select count(*) from portal_uploads) = 2, 'manager sees uploads');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000012';
select pg_temp.expect((select count(*) from portal_uploads) = 2, 'viewer reads uploads');
update portal_uploads set note = 'viewer' where filename = 'other.pdf';
select pg_temp.expect((select count(*) from portal_uploads where note = 'viewer') = 0, 'viewer cannot change uploads');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect((select count(*) from portal_uploads) = 0, 'a stranger sees no uploads');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
delete from portal_uploads where filename = 'other.pdf';
select pg_temp.expect((select count(*) from portal_uploads) = 1, 'admin deletes an upload');
reset role;

set role anon;
select pg_temp.expect(pg_temp.fails('select 1 from portal_uploads'), 'anon cannot read uploads');
reset role;

------------------------------------------------------------ Monthly client reports (Wave 4, PR Q)
insert into client_report_drafts (account_id, month, summary, facts)
  select id, '2026-10-01', 'AI draft for the clinic', '["4 hours worked"]' from accounts where name = 'Assigned Clinic LLC';
insert into client_report_drafts (account_id, month, summary)
  select id, '2026-10-01', 'AI draft for the dentist' from accounts where name = 'Prospect Dental';
select pg_temp.expect(pg_temp.fails($q$insert into client_report_drafts (account_id, month) select id, '2026-10-01' from accounts where name = 'Prospect Dental'$q$), 'one report per client per month');
select pg_temp.expect(pg_temp.fails($q$insert into client_report_drafts (account_id, month) select id, '2026-10-15' from accounts limit 1$q$), 'a report month is the 1st');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect((select count(*) from client_report_drafts) = 1, 'staff (VA) sees report drafts only on their accounts');
select pg_temp.expect(not pg_temp.fails($q$update client_report_drafts set summary = 'Checked by the VA' where summary = 'AI draft for the clinic'$q$), 'staff (VA) edits a draft summary');
select pg_temp.expect(pg_temp.fails($q$update client_report_drafts set status = 'sent' where summary = 'Checked by the VA'$q$), 'staff (VA) cannot mark a report sent');
select pg_temp.expect(pg_temp.fails($q$update client_report_drafts set sent_email_to = 'x@y.com' where summary = 'Checked by the VA'$q$), 'staff (VA) cannot fake the sent fields');
select pg_temp.expect(pg_temp.fails($q$insert into client_report_drafts (account_id, month) select id, '2026-09-01' from accounts where name = 'Assigned Clinic LLC'$q$), 'staff (VA) cannot add drafts: only the function does');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect((select count(*) from client_report_drafts) = 2, 'sales sees the report drafts');
select pg_temp.expect(not pg_temp.fails($q$update client_report_drafts set status = 'skipped' where summary = 'AI draft for the dentist'$q$), 'sales skips a report');
select pg_temp.expect(not pg_temp.fails($q$update client_report_drafts set status = 'draft' where summary = 'AI draft for the dentist'$q$), 'sales puts it back');
select pg_temp.expect(pg_temp.fails($q$update client_report_drafts set facts = '["made up"]' where summary = 'AI draft for the dentist'$q$), 'sales cannot change the report numbers');
reset role;

-- Once sent (by the function), nobody edits it from the app.
update client_report_drafts set status = 'sent', sent_by = 'alfred@redreach.ae', sent_at = now() where summary = 'AI draft for the dentist';

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000013';
select pg_temp.expect((select count(*) from client_report_drafts) = 2, 'manager sees the report drafts');
update client_report_drafts set summary = 'changed after sending' where status = 'sent';
select pg_temp.expect((select count(*) from client_report_drafts where summary = 'changed after sending') = 0, 'a sent report cannot be edited');
delete from client_report_drafts;
select pg_temp.expect((select count(*) from client_report_drafts) = 2, 'manager cannot delete report drafts');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000012';
select pg_temp.expect((select count(*) from client_report_drafts) = 2, 'viewer reads the report drafts');
update client_report_drafts set summary = 'viewer' where status = 'draft';
select pg_temp.expect((select count(*) from client_report_drafts where summary = 'viewer') = 0, 'viewer cannot edit report drafts');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect((select count(*) from client_report_drafts) = 0, 'a stranger sees no report drafts');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
delete from client_report_drafts where status = 'sent';
select pg_temp.expect((select count(*) from client_report_drafts) = 1, 'admin deletes a report draft');
reset role;

set role anon;
select pg_temp.expect(pg_temp.fails('select 1 from client_report_drafts'), 'anon cannot read report drafts');
reset role;

------------------------------------------------------------ Go live checklist (Wave 4, PR R)
select pg_temp.expect((select count(*) from build_template_items where kind = 'golive') >= 27, 'the starter templates have go live steps');
select pg_temp.expect(pg_temp.fails($q$insert into build_template_items (template_id, kind, stage, title, owner, due_days) select id, 'golive', 'live', 'x', 'someone', 1 from build_templates limit 1$q$), 'a go live owner is Red Reach or the client');
select pg_temp.expect(pg_temp.fails($q$insert into build_template_items (template_id, kind, stage, title, due_days) select id, 'golive', null, 'x', 1 from build_templates limit 1$q$), 'a go live step needs a stage');
select pg_temp.expect(pg_temp.fails($q$insert into build_template_items (template_id, kind, stage, title, due_days) select id, 'golive', 'live', 'x', 400 from build_templates limit 1$q$), 'go live days stay within a year');
insert into build_tasks (account_id, stage, title, kind, owner, due_days, due_date)
  select id, 'live', 'Go live', 'golive', 'red_reach', 21, '2026-11-15' from accounts where name = 'Assigned Clinic LLC';
insert into build_tasks (account_id, stage, title, kind, owner, due_days, due_date)
  select id, 'live', 'Go live', 'golive', 'red_reach', 21, '2026-11-20' from accounts where name = 'Prospect Dental';

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect((select count(*) from build_tasks where kind = 'golive') = 1, 'staff (VA) sees go live steps only on their accounts');
select pg_temp.expect(not pg_temp.fails($q$update build_tasks set done = true, owner = 'client', due_date = '2026-11-18' where kind = 'golive'$q$), 'staff (VA) ticks and changes a go live step on their account');
select pg_temp.expect(pg_temp.fails($q$update build_tasks set kind = 'unknown' where kind = 'golive'$q$), 'a step kind is task or golive');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect((select count(*) from build_tasks where kind = 'golive') = 2, 'sales sees go live steps');
select pg_temp.expect(pg_temp.fails($q$update build_template_items set due_days = 333 where kind = 'golive'$q$) or (select count(*) from build_template_items where due_days = 333) = 0, 'sales cannot change template go live steps');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000013';
select pg_temp.expect(not pg_temp.fails($q$update build_template_items set due_days = 22 where kind = 'golive' and title = 'Go live'$q$), 'manager edits template go live steps');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000012';
select pg_temp.expect((select count(*) from build_tasks where kind = 'golive') = 2, 'viewer reads go live steps');
update build_tasks set done = false where kind = 'golive';
select pg_temp.expect((select count(*) from build_tasks where kind = 'golive' and done) = 1, 'viewer cannot tick go live steps');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect((select count(*) from build_tasks where kind = 'golive') = 0, 'a stranger sees no go live steps');
reset role;

set role anon;
select pg_temp.expect(pg_temp.fails('select 1 from build_tasks'), 'anon cannot read go live steps');
reset role;

------------------------------------------------------------ Before the call brief (Wave 4, PR S)
insert into ai_usage_log (account_id, feature, model, input_tokens, output_tokens, cost_usd)
  select id, 'call_brief', 'claude-haiku-5-5', 500, 80, 0.0001 from accounts where name = 'Assigned Clinic LLC';
select pg_temp.expect((select count(*) from ai_usage_log where feature = 'call_brief') = 1, 'the brief logs its AI cost as call_brief');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect((select count(*) from ai_usage_log where feature = 'call_brief') = 1, 'staff (VA) sees the brief cost on their account');
select pg_temp.expect(pg_temp.fails($q$insert into ai_usage_log (account_id, feature) select id, 'call_brief' from accounts where name = 'Assigned Clinic LLC'$q$), 'staff (VA) cannot log brief costs themselves');
select pg_temp.expect(not pg_temp.fails($q$insert into account_activities (account_id, kind, body) select id, 'note', 'Before the call brief' from accounts where name = 'Assigned Clinic LLC'$q$), 'staff (VA) saves a brief as a note on their account');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect((select count(*) from ai_usage_log where feature = 'call_brief') = 1, 'sales sees the brief cost');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000013';
select pg_temp.expect((select count(*) from ai_usage_log where feature = 'call_brief') = 1, 'manager sees the brief cost');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000012';
select pg_temp.expect(pg_temp.fails($q$insert into account_activities (account_id, kind, body) select id, 'note', 'Before the call brief' from accounts limit 1$q$), 'viewer cannot save a brief');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect((select count(*) from ai_usage_log where feature = 'call_brief') = 0, 'a stranger sees no brief cost');
reset role;

------------------------------------------------------------ Duplicates and merge (Wave 4, PR T)
insert into accounts (type, name, reference) values ('ai_crm_client', 'Merge Keep', 'AC-10-26001'), ('ai_crm_client', 'Merge Dup', 'AC-10-26002');
update accounts set city = 'Dubai', notes = 'dup notes' where name = 'Merge Dup';
insert into account_contacts (account_id, name, phone, is_primary) select id, 'Keep Primary', '0501112222', true from accounts where name = 'Merge Keep';
insert into account_contacts (account_id, name, phone, is_primary) select id, 'Dup Primary', '0501112222', true from accounts where name = 'Merge Dup';
insert into account_activities (account_id, kind, body) select id, 'call', 'dup call' from accounts where name = 'Merge Dup';
-- A table that allows one row per account, to prove a clashing row is left behind, not lost or failing the merge.
create table if not exists public.zz_merge_clash (account_id uuid unique references public.accounts(id) on delete cascade);
insert into zz_merge_clash select id from accounts where name in ('Merge Keep', 'Merge Dup');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect(pg_temp.fails($q$select rr_merge_accounts((select id from accounts where name = 'Merge Keep'), (select id from accounts where name = 'Merge Dup'))$q$), 'sales cannot merge accounts');
select pg_temp.expect(pg_temp.fails($q$insert into duplicate_dismissals (kind, a_id, b_id) values ('account', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002')$q$), 'sales cannot dismiss a pair');
select pg_temp.expect(pg_temp.fails($q$select rr_repoint_rows('public.accounts'::regclass, gen_random_uuid(), gen_random_uuid())$q$), 'nobody calls the repoint helper directly');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect(pg_temp.fails($q$select rr_merge_contacts(gen_random_uuid(), gen_random_uuid())$q$), 'staff (VA) cannot merge contacts');
select pg_temp.expect((select count(*) from duplicate_dismissals) = 0, 'staff (VA) sees no dismissed pairs');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000012';
select pg_temp.expect(pg_temp.fails($q$select rr_merge_accounts(gen_random_uuid(), gen_random_uuid())$q$), 'viewer cannot merge');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000013';
select pg_temp.expect(not pg_temp.fails($q$insert into duplicate_dismissals (kind, a_id, b_id) values ('account', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002')$q$), 'manager marks a pair not a duplicate');
select pg_temp.expect(pg_temp.fails($q$insert into duplicate_dismissals (kind, a_id, b_id) values ('account', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001')$q$), 'a pair is stored smaller id first');
select pg_temp.expect((select count(*) from duplicate_dismissals) = 1, 'manager reads dismissed pairs');
select pg_temp.expect(not pg_temp.fails($q$select rr_merge_accounts((select id from accounts where name = 'Merge Keep'), (select id from accounts where name = 'Merge Dup'))$q$), 'manager merges two accounts');
reset role;

select pg_temp.expect((select count(*) from accounts where name = 'Merge Dup') = 0, 'the duplicate account is removed');
select pg_temp.expect((select count(*) from account_activities a join accounts c on c.id = a.account_id where c.name = 'Merge Keep' and a.body = 'dup call') = 1, 'the timeline moves to the kept account');
select pg_temp.expect((select count(*) from account_activities a join accounts c on c.id = a.account_id where c.name = 'Merge Keep' and a.kind = 'system' and a.body like 'Merged Merge Dup%') = 1, 'the merge is noted on the timeline');
select pg_temp.expect((select count(*) from account_contacts c join accounts a on a.id = c.account_id where a.name = 'Merge Keep') = 2, 'contacts move to the kept account');
select pg_temp.expect((select count(*) from account_contacts c join accounts a on a.id = c.account_id where a.name = 'Merge Keep' and c.is_primary) = 1, 'the kept account keeps one primary contact');
select pg_temp.expect((select city from accounts where name = 'Merge Keep') = 'Dubai', 'blank details are filled from the duplicate');
select pg_temp.expect((select count(*) from zz_merge_clash) = 1, 'a clashing row is left behind with the duplicate');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000013';
select pg_temp.expect(not pg_temp.fails($q$select rr_merge_contacts((select c.id from account_contacts c where c.name = 'Keep Primary'), (select c.id from account_contacts c where c.name = 'Dup Primary'))$q$), 'manager merges two contacts');
reset role;
select pg_temp.expect((select count(*) from account_contacts where name in ('Keep Primary', 'Dup Primary')) = 1, 'the duplicate contact is removed');
drop table public.zz_merge_clash;

set role anon;
select pg_temp.expect(pg_temp.fails('select 1 from duplicate_dismissals'), 'anon cannot read dismissed pairs');
select pg_temp.expect(pg_temp.fails($q$select rr_merge_accounts(gen_random_uuid(), gen_random_uuid())$q$), 'anon cannot merge');
reset role;

------------------------------------------------------------ Prospect fit sheet (Wave 5, PR V)
insert into accounts (type, name, reference, owner_user_id) values
  ('ctrm_prospect', 'VA Fit Prospect', 'AC-09-26101', (select id from app_users where email = 'va@redreach.ae'));
insert into account_contacts (account_id, name) select id, 'Fit Decider' from accounts where name = 'VA Fit Prospect';
insert into account_contacts (account_id, name) select id, 'Clinic Person' from accounts where name = 'Assigned Clinic LLC';
insert into ctrm_deals (account_id, stage, region, next_action, next_action_date)
  select id, 'intro_call_booked', 'middle_east', 'Book the demo', '2026-12-01' from accounts where name = 'VA Fit Prospect';
select id as other_house from accounts where name = 'Other Trading House' \gset

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect(pg_temp.fails($q$update ctrm_deals set stage = 'demo_done' where account_id = (select id from accounts where name = 'VA Fit Prospect')$q$), 'a deal cannot move to Demo done without a fit sheet');
select pg_temp.expect(pg_temp.fails($q$insert into ctrm_deals (account_id, stage, region, next_action, next_action_date) select id, 'evaluating', 'middle_east', 'x', '2026-12-01' from accounts where name = 'VA Fit Prospect'$q$), 'a new deal cannot start past the demo without a fit sheet');
select pg_temp.expect(not pg_temp.fails($q$insert into ctrm_fit_sheets (account_id, commodities, focus) select id, 'Diesel', 'trading' from accounts where name = 'VA Fit Prospect'$q$), 'staff (VA) starts a fit sheet on their account');
select pg_temp.expect(pg_temp.fails($q$update ctrm_deals set stage = 'demo_done' where account_id = (select id from accounts where name = 'VA Fit Prospect')$q$), 'a half filled fit sheet still blocks the demo');
select pg_temp.expect(pg_temp.fails($q$update ctrm_fit_sheets set decision_maker_id = (select id from account_contacts where name = 'Clinic Person')$q$), 'the decision maker must be on the same account');
select pg_temp.expect(not pg_temp.fails($q$update ctrm_fit_sheets set user_count = 8, current_system = 'Spreadsheets', modules = '{Credit}', decision_maker_id = (select id from account_contacts where name = 'Fit Decider')$q$), 'staff (VA) completes the fit sheet');
select pg_temp.expect(not pg_temp.fails($q$update ctrm_deals set stage = 'demo_done' where account_id = (select id from accounts where name = 'VA Fit Prospect')$q$), 'with the fit sheet the deal moves to Demo done');
select pg_temp.expect(pg_temp.fails(format('insert into ctrm_fit_sheets (account_id) values (%L)', :'other_house')), 'staff (VA) cannot add a fit sheet to an account that is not theirs');
delete from ctrm_fit_sheets;
reset role;
select pg_temp.expect((select count(*) from ctrm_fit_sheets) = 1, 'staff (VA) cannot delete a fit sheet');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect((select count(*) from ctrm_fit_sheets) = 1, 'sales reads fit sheets');
select pg_temp.expect(not pg_temp.fails($q$insert into ctrm_fit_sheets (account_id, commodities) select id, 'Crude' from accounts where name = 'Other Trading House'$q$), 'sales adds a fit sheet');
select pg_temp.expect(pg_temp.fails($q$insert into ctrm_fit_sheets (account_id) select id from accounts where name = 'Other Trading House'$q$), 'one fit sheet per account');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000012';
select pg_temp.expect((select count(*) from ctrm_fit_sheets) = 2, 'viewer reads fit sheets');
update ctrm_fit_sheets set notes = 'viewer edit';
select pg_temp.expect((select count(*) from ctrm_fit_sheets where notes = 'viewer edit') = 0, 'viewer cannot edit fit sheets');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000013';
select pg_temp.expect(not pg_temp.fails($q$delete from ctrm_fit_sheets where commodities = 'Crude'$q$), 'manager deletes a fit sheet');
select pg_temp.expect((select count(*) from ctrm_fit_sheets) = 1, 'the deleted fit sheet is gone');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect((select count(*) from ctrm_fit_sheets) = 0, 'a stranger sees no fit sheets');
reset role;

set role anon;
select pg_temp.expect(pg_temp.fails('select 1 from ctrm_fit_sheets'), 'anon cannot read fit sheets');
reset role;

------------------------------------------------------------ CTRM Next client issues (Wave 5, PR W)
insert into tickets (account_id, subject, channel, vendor_status) select id, 'Export fails', 'ctrm_next', 'not_raised' from accounts where name = 'VA Fit Prospect';
insert into tickets (account_id, subject, channel) select id, 'Other house issue', 'ctrm_next' from accounts where name = 'Other Trading House';
select pg_temp.expect(pg_temp.fails($q$insert into tickets (subject, channel) values ('x', 'carrier_pigeon')$q$), 'only listed channels are allowed');
select pg_temp.expect(pg_temp.fails($q$update tickets set vendor_status = 'lost_it' where subject = 'Export fails'$q$), 'only listed vendor statuses are allowed');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
select pg_temp.expect((select count(*) from tickets where channel = 'ctrm_next') = 1, 'staff (VA) sees issues on their account only');
select pg_temp.expect(not pg_temp.fails($q$update tickets set vendor_ticket_ref = 'CN-881', vendor_status = 'raised', client_updated_at = now() where subject = 'Export fails'$q$), 'staff (VA) updates the vendor side and the client update date');
select pg_temp.expect(not pg_temp.fails($q$update tickets set vendor_status = 'fixed' where subject = 'Export fails'$q$), 'staff (VA) marks it fixed');
reset role;
select pg_temp.expect((select vendor_fixed_at is not null from tickets where subject = 'Export fails'), 'the fixed date is set when it becomes Fixed');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
update tickets set vendor_fixed_at = '2020-01-01' where subject = 'Export fails';
reset role;
select pg_temp.expect((select vendor_fixed_at > '2026-01-01' from tickets where subject = 'Export fails'), 'nobody back dates the fixed date');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000011';
update tickets set vendor_status = 'in_progress' where subject = 'Export fails';
reset role;
select pg_temp.expect((select vendor_fixed_at is null from tickets where subject = 'Export fails'), 'moving off Fixed clears the fixed date');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect((select count(*) from tickets where channel = 'ctrm_next') = 2, 'sales sees every CTRM issue');
select pg_temp.expect(not pg_temp.fails($q$update tickets set vendor_status = 'waiting_for_client' where subject = 'Other house issue'$q$), 'sales updates the vendor side');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000013';
select pg_temp.expect(not pg_temp.fails($q$update tickets set client_updated_at = now() where subject = 'Other house issue'$q$), 'manager notes a client update');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000012';
select pg_temp.expect((select count(*) from tickets where channel = 'ctrm_next') = 2, 'viewer reads CTRM issues');
update tickets set vendor_ticket_ref = 'viewer' where channel = 'ctrm_next';
reset role;
select pg_temp.expect((select count(*) from tickets where vendor_ticket_ref = 'viewer') = 0, 'viewer cannot change CTRM issues');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect((select count(*) from tickets where channel = 'ctrm_next') = 0, 'a stranger sees no CTRM issues');
reset role;

set role anon;
select pg_temp.expect(pg_temp.fails($q$select vendor_ticket_ref from tickets$q$), 'anon cannot read CTRM issues');
reset role;
