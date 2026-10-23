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
select pg_temp.expect(not pg_temp.fails($q$update ctrm_deals set stage = 'lost', lost_reason = 'Chose another vendor' where region = 'india'$q$), 'lost with a reason is fine');
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
