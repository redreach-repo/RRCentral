-- RLS regression tests. Each check raises an exception on failure.
-- Run via supabase/tests/run.sh.
\set ON_ERROR_STOP 1

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'alfredsv@gmail.com', now()),
  ('00000000-0000-0000-0000-00000000000b', 'sales@redreach.ae', now()),
  ('00000000-0000-0000-0000-00000000000c', 'random@gmail.com', now()),
  ('00000000-0000-0000-0000-00000000000d', 'unconfirmed@redreach.ae', null),
  ('00000000-0000-0000-0000-00000000000e', 'former@redreach.ae', now());
insert into app_users (email, name, role, active) values
  ('Sales@RedReach.ae', 'Sales', 'sales', true),
  ('unconfirmed@redreach.ae', 'U', 'sales', true),
  ('former@redreach.ae', 'Former', 'sales', false);
insert into app_settings values ('zohoClientSecret', 's3cret'), ('zohoRefreshToken', 'rt'), ('zohoClientId', 'cid');
insert into vendors (company_name) values ('Acme Supplier');
insert into crm (company_name) values ('Lead Co');
insert into invoices (client, reference_number) values ('Client A', 'RR-1');
insert into expenses (vendor) values ('Fuel');

create function pg_temp.expect(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'RLS TEST FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;

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
reset role;

------------------------------------------------------------ sales
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect((select count(*) from crm) = 1, 'sales reads CRM (email match is case-insensitive)');
select pg_temp.expect((select count(*) from app_settings where key in ('zohoClientSecret', 'zohoRefreshToken')) = 0, 'sales cannot read Zoho secrets');
select pg_temp.expect((select count(*) from app_settings where key = 'zohoClientId') = 1, 'sales can read Zoho client id');
update crm set notes = 'called' where company_name = 'Lead Co';
select pg_temp.expect((select notes from crm where company_name = 'Lead Co') = 'called', 'sales can update CRM');
insert into app_settings values ('delivery_notes_store', '[]');
update app_settings set value = 'HACK' where key = 'iban';
delete from invoices where reference_number = 'RR-1';
delete from expenses where vendor = 'Fuel';
update app_users set role = 'admin' where lower(email) = 'sales@redreach.ae';
select pg_temp.expect((select count(*) from audit_log) = 0, 'sales cannot read audit log');
select pg_temp.expect(pg_temp.fails($q$insert into audit_log (table_name, operation) values ('crm', 'DELETE')$q$), 'sales cannot forge audit rows');
reset role;
select pg_temp.expect((select value from app_settings where key = 'iban') <> 'HACK', 'sales cannot change bank details');
select pg_temp.expect((select count(*) from invoices) = 1, 'sales cannot delete invoices');
select pg_temp.expect((select count(*) from expenses) = 1, 'sales cannot delete expenses');
select pg_temp.expect((select role from app_users where lower(email) = 'sales@redreach.ae') = 'sales', 'sales cannot promote self');
select pg_temp.expect(exists (select 1 from app_settings where key = 'delivery_notes_store'), 'sales can write ordinary settings');

------------------------------------------------------------ admin
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect((select value from app_settings where key = 'zohoClientSecret') = 's3cret', 'admin reads secrets');
update app_settings set value = 'AE00' where key = 'iban';
delete from invoices where reference_number = 'RR-1';
select pg_temp.expect((select count(*) from invoices) = 0, 'admin can delete invoices');
update app_settings set value = 'new-secret' where key = 'zohoClientSecret';
select pg_temp.expect(exists (
  select 1 from audit_log where table_name = 'invoices' and operation = 'DELETE' and actor_email = 'alfredsv@gmail.com'
), 'audit log records who deleted an invoice');
select pg_temp.expect(exists (
  select 1 from audit_log where table_name = 'crm' and operation = 'UPDATE' and actor_email = 'sales@redreach.ae' and changed_fields = '{notes}'
), 'audit log records changed fields');
select pg_temp.expect(not exists (
  select 1 from audit_log where table_name = 'app_settings' and (new_data::text like '%new-secret%' or old_data::text like '%s3cret%')
), 'audit log redacts secrets');
reset role;
