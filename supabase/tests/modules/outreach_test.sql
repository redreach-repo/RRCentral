-- Prospect outreach pipeline (20261338090000_outreach_pipeline.sql).
-- Import and dedupe, the human-only approval and send rules, the daily cap,
-- unsubscribe, audit without email text, and one access check per role.
-- Fictional companies and people only.
begin;
\ir _fixtures.sql

-- A real sign in session: a session_id claim, no AI key.
create or replace function pg_temp.human(who text) returns void language plpgsql as $$
begin
  perform pg_temp.login(who);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.session_id', 'sess-' || who, true);
end $$;

-- An AI connector (MCP) token for the admin: hm_mcp_key, no session_id.
create or replace function pg_temp.ai_admin() returns void language plpgsql as $$
begin
  perform pg_temp.login('admin');
  perform set_config('request.jwt.claim.session_id', '', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-0000000001a1","role":"authenticated","iss":"highmast-mcp","hm_mcp_key":"11111111-1111-4111-8111-111111111111"}', true);
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

delete from public.outreach_events;
delete from public.outreach_messages;
delete from public.outreach_import_rows;
delete from public.outreach_import_batches;
delete from public.outreach_suppressions;
delete from public.external_blocklist;
delete from public.outreach_senders;
delete from public.outreach_settings;

-- An existing prospect, to be found as a duplicate.
insert into public.accounts (type, name, reference, country, tenant_id)
values ('ctrm_prospect', 'Existing Oil Trading L.L.C.', 'AC-09-26T001', 'UAE', 'a0000000-0000-4000-8000-000000000001');

------------------------------------------------------------
-- Settings, blocklist
------------------------------------------------------------
select pg_temp.human('admin');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_outreach_save_settings(0, 'X', 'Y', 'Opt out')$$),
  'daily cap must be at least 1');
select public.rr_outreach_save_settings(10, 'Example Reach FZE', 'PO Box 0000, Test Free Zone, Example City', 'Opt out here:');
select pg_temp.expect((select daily_cap from public.outreach_settings) = 10, 'admin saves outreach settings (cap 10)');
select pg_temp.expect(
  (public.rr_outreach_blocklist_load('compman', '[{"company":"Blocked Energy Co","domain":"https://www.blocked-energy.example/"},{"company":"","domain":"someone@ctrm-client.example"}]'::jsonb) ->> 'added')::int = 3,
  'blocklist loads company names and domains');
select pg_temp.expect(
  (select signature from public.rr_outreach_my_sender()) like '%On behalf of CTRM Next%mt-admin@redreach.ae',
  'my sender gets the default signature');

------------------------------------------------------------
-- Import: stage, dedupe, flag enrichment
------------------------------------------------------------
create temp table b as
select public.rr_outreach_import_stage('prospects-test.xlsx', '[
  {"company":"Falcon Bay Trading FZE","contact_name":"Layla Test","title":"Head of Trading","email":"Layla@falconbay.example","country":"UAE","signal_used":"Hiring a risk analyst","signal_url":"https://jobs.example/1","subject":"Trading risk at Falcon Bay","body":"Hi Layla,\nShort note about CTRM Next.","send_from":"mt-admin@redreach.ae"},
  {"company":"Falcon Bay Trading","contact_name":"Omar Test","email":"omar@falconbay.example"},
  {"company":"Dune Metals","contact_name":"Ravi Test","email":"ravi@falconbay.example"},
  {"company":"Existing Oil Trading","email":"a@existing-oil.example"},
  {"company":"Blocked Energy Co LLC","email":"x@whatever.example"},
  {"company":"Northwind Fuels","email":"buyer@ctrm-client.example"},
  {"company":"Coral Petroleum","contact_name":"","email":"info@coral.example","country":"India","subject":"Hello","body":"Body"},
  {"company":"Saffron Commodities","contact_name":"Mei Test","email":""},
  {"company":"Bad Email Ltd","email":"not-an-email"},
  {"company":"","email":"nobody@nowhere.example"}
]'::jsonb) as j;
select pg_temp.expect((select (j ->> 'row_count')::int from b) = 10, 'ten rows staged');
select pg_temp.expect((select (j ->> 'new_count')::int from b) = 1, 'one new row');
select pg_temp.expect((select (j ->> 'enrichment_count')::int from b) = 2, 'info@ and no-email rows need enrichment');
select pg_temp.expect((select (j ->> 'duplicate_count')::int from b) = 3, 'duplicates: same company, same domain in file, existing account');
select pg_temp.expect((select (j ->> 'blocked_count')::int from b) = 2, 'CompMan company and CTRM Next domain blocked');
select pg_temp.expect((select (j ->> 'error_count')::int from b) = 2, 'bad email and missing company are errors');
select pg_temp.expect(
  (select reason from public.outreach_import_rows where row_number = 4) = 'Company is already a client or prospect',
  'existing account found through the normalised company name');
select pg_temp.expect(
  (select email from public.outreach_import_rows where row_number = 1) = 'layla@falconbay.example',
  'emails are kept lower case');

select pg_temp.expect(
  (public.rr_outreach_import_commit((select (j ->> 'id')::uuid from b)) ->> 'created')::int = 3,
  'commit creates the new and needs-enrichment rows only');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_outreach_import_commit((select (j ->> 'id')::uuid from b))$$),
  'a batch cannot be imported twice');
select pg_temp.expect(
  (select count(*) from public.accounts where type = 'ctrm_prospect' and source like 'Outreach import:%') = 3,
  'three CTRM prospect accounts made');
select pg_temp.expect(
  (select count(*) from public.accounts where source like 'Outreach import:%' and reference ~ '^AC-09-') = 3,
  'accounts get AC-09 references');
select pg_temp.expect(
  (select data_source || '|' || country from public.account_contacts where email = 'layla@falconbay.example')
    = 'Outreach import: prospects-test.xlsx|UAE',
  'contact stores data source and country');
select pg_temp.expect(
  (select count(*) from public.ctrm_deals where source = 'outreach' and stage = 'identified') = 3,
  'a CTRM Next deal per prospect');
select pg_temp.expect(
  (select region from public.ctrm_deals d join public.accounts a on a.id = d.account_id where a.name = 'Coral Petroleum') = 'india',
  'India prospects go to the India region');
select pg_temp.expect(
  (select count(*) from public.outreach_messages where status = 'draft') = 3, 'three draft emails');
select pg_temp.expect(
  (select count(*) from public.outreach_messages where needs_enrichment) = 2, 'two flagged as needing enrichment');
reset role;

------------------------------------------------------------
-- Who can see and do what
------------------------------------------------------------
select pg_temp.human('manager');
select pg_temp.expect((select count(*) from public.outreach_messages) = 3, 'manager reads outreach emails');
reset role;

select pg_temp.human('sales');
select pg_temp.expect((select count(*) from public.outreach_messages) = 0, 'sales cannot read outreach');
select pg_temp.expect((select count(*) from public.outreach_import_rows) = 0, 'sales cannot read the staged rows');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_outreach_import_stage('x.csv', '[{"company":"Sales Co","email":"a@salesco.example"}]'::jsonb)$$),
  'sales cannot import');
reset role;

select pg_temp.human('staff');
select pg_temp.expect((select count(*) from public.outreach_messages) = 0, 'staff cannot read outreach');
reset role;

select pg_temp.human('viewer');
select pg_temp.expect((select count(*) from public.outreach_messages) = 0, 'viewer cannot read outreach');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_outreach_decide((select id from public.outreach_messages limit 1), 'approve')$$),
  'viewer cannot approve');
reset role;

select pg_temp.human('stranger');
select pg_temp.expect((select count(*) from public.outreach_messages) = 0, 'a non-member reads nothing');
reset role;

select pg_temp.human('b_admin');
select pg_temp.expect((select count(*) from public.outreach_messages) = 0, 'another company''s admin reads nothing');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_outreach_decide('00000000-0000-0000-0000-000000000000', 'approve')$$),
  'another company''s admin cannot approve');
reset role;

create temp table ids as
select
  (select id from public.outreach_messages where to_email = 'layla@falconbay.example') as good,
  (select id from public.outreach_messages where to_email = 'info@coral.example') as generic,
  (select id from public.outreach_messages where company = 'Saffron Commodities') as noemail;
grant select on ids to authenticated, service_role;

------------------------------------------------------------
-- Nobody but a person can approve
------------------------------------------------------------
select pg_temp.ai_admin();
select pg_temp.expect(not public.rr_outreach_is_human_manager(), 'an AI connector session is not a person');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_outreach_decide((select good from ids), 'approve')$$),
  'an AI connector key cannot approve');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_outreach_claim_send((select good from ids))$$),
  'an AI connector key cannot send');
select pg_temp.expect((select count(*) from public.outreach_messages) = 0, 'an AI connector key cannot read outreach');
reset role;

select pg_temp.login('admin');
select set_config('request.jwt.claim.session_id', '', true);
select pg_temp.expect(
  pg_temp.fails($$select public.rr_outreach_decide((select good from ids), 'approve')$$),
  'a token without a sign in session cannot approve');
reset role;

insert into public.view_as_sessions (admin_email, target_email, auth_session_id, expires_at)
values ('mt-admin@redreach.ae', 'mt-manager@redreach.ae', 'sess-manager', now() + interval '20 minutes');
select pg_temp.human('manager');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_outreach_decide((select good from ids), 'approve')$$),
  'an admin viewing as the manager cannot approve as them');
reset role;
delete from public.view_as_sessions where auth_session_id = 'sess-manager';

select pg_temp.human('admin');
select pg_temp.expect(
  pg_temp.fails($$update public.outreach_messages set status = 'ready' where id = (select good from ids)$$),
  'the table cannot be written directly');
reset role;

-- Even the database owner cannot mark an email approved without a matching approval.
select pg_temp.expect(
  pg_temp.fails($$update public.outreach_messages set status = 'ready', approved_by = (select id from public.app_users where email = 'mt-admin@redreach.ae'), approved_hash = 'forged' where id = (select good from ids)$$),
  'a forged approval hash is refused');
select pg_temp.expect(
  pg_temp.fails($$update public.outreach_messages set status = 'sending' where id = (select good from ids)$$),
  'a draft cannot jump to sending');

------------------------------------------------------------
-- Approve, edit resets, approve again, send
------------------------------------------------------------
select pg_temp.human('admin');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_outreach_decide((select noemail from ids), 'approve')$$),
  'an email with no address cannot be approved');
select pg_temp.expect(
  (select status || '|' || blocked_reason from public.rr_outreach_decide((select generic from ids), 'approve'))
    = 'approved|Only a general address: find a named person',
  'an info@ email can be approved but stays blocked');
select pg_temp.expect(
  (select status from public.rr_outreach_decide((select good from ids), 'approve')) = 'ready',
  'admin approves: ready to send');
select pg_temp.expect(
  (select approved_by from public.outreach_messages where id = (select good from ids))
    = (select id from public.app_users where email = 'mt-admin@redreach.ae'),
  'approved_by is the person');

select public.rr_outreach_edit((select good from ids), 'layla@falconbay.example', 'Trading risk at Falcon Bay', 'Hi Layla,\nEdited.');
select pg_temp.expect(
  (select status = 'awaiting_approval' and approved_by is null and approved_hash is null
   from public.outreach_messages where id = (select good from ids)),
  'an edit resets the approval');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_outreach_claim_send((select good from ids))$$),
  'an edited email cannot be sent');
select public.rr_outreach_decide((select good from ids), 'approve');
reset role;

-- Someone else (the manager) cannot send what the admin approved.
select pg_temp.human('manager');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_outreach_claim_send((select good from ids))$$),
  'only the person who approved can send');
reset role;

-- A change behind the app's back (database owner) also clears the approval.
update public.outreach_messages set body = body || ' ' where id = (select good from ids);
select pg_temp.expect(
  (select status from public.outreach_messages where id = (select good from ids)) = 'awaiting_approval',
  'any body change, from anywhere, resets to awaiting approval');
select pg_temp.human('admin');
select public.rr_outreach_decide((select good from ids), 'approve');

create temp table claim as select public.rr_outreach_claim_send((select good from ids)) as j;
grant select on claim to authenticated, service_role;
select pg_temp.expect(
  (select j ->> 'address' from claim) = 'PO Box 0000, Test Free Zone, Example City'
    and (select j ->> 'unsubscribe_token' from claim) ~ '^[0-9a-f]{64}$'
    and (select j ->> 'sender_email' from claim) = 'mt-admin@redreach.ae',
  'claim returns sender, address and an unsubscribe token');
select pg_temp.expect(
  (select status from public.outreach_messages where id = (select good from ids)) = 'sending',
  'the email is now sending');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_outreach_claim_send((select good from ids))$$),
  'it cannot be claimed twice');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_outreach_finish_send((select good from ids), true, '123', '')$$),
  'a signed in person cannot mark it sent');
reset role;

set local role service_role;
select public.rr_outreach_finish_send((select good from ids), true, '1700000000000123', '');
reset role;
select pg_temp.expect(
  (select status from public.outreach_messages where id = (select good from ids)) = 'sent', 'the email is sent');
select pg_temp.expect(
  (select count(*) from public.outreach_events where message_id = (select good from ids) and event = 'sent') = 1,
  'a sent event is logged');
select pg_temp.expect(
  (select count(*) from public.account_activities a join ids on true
   join public.outreach_messages m on m.id = ids.good
   where a.account_id = m.account_id and a.kind = 'email' and a.body like 'Outreach email sent to Layla Test%') = 1,
  'the send is on the account timeline');
select pg_temp.expect(
  (select count(*) from public.mail_links l join public.outreach_messages m on m.id = (select good from ids)
   where l.target_type = 'account' and l.target_id = m.account_id and l.message_id = '1700000000000123') = 1,
  'the sent email is in the client''s email history');
select pg_temp.expect(
  (select d.stage from public.ctrm_deals d join public.outreach_messages m on m.deal_id = d.id where m.id = (select good from ids)) = 'contacted',
  'the CTRM deal moves to contacted');
select pg_temp.expect(
  not exists (select 1 from public.audit_log
              where table_name = 'outreach_messages'
                and (coalesce(new_data, '{}'::jsonb) ? 'body' or coalesce(old_data, '{}'::jsonb) ? 'body'
                     or coalesce(new_data, '{}'::jsonb) ? 'subject' or coalesce(new_data::text, '') like '%Edited%')),
  'the audit log never holds the email subject or body');
select pg_temp.expect(
  (select count(*) from public.audit_log where table_name = 'outreach_messages') >= 5,
  'every change to an outreach email is in the audit log');

------------------------------------------------------------
-- Daily cap
------------------------------------------------------------
select pg_temp.human('admin');
select public.rr_outreach_save_settings(1, 'Example Reach FZE', 'PO Box 0000, Test Free Zone, Example City', 'Opt out here:');
select public.rr_outreach_edit((select generic from ids), 'priya@coral.example', 'Hello', 'Body');
select pg_temp.expect(
  (select status from public.rr_outreach_decide((select generic from ids), 'approve')) = 'ready',
  'a named address clears the enrichment block');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_outreach_claim_send((select generic from ids))$$),
  'the daily cap stops the next send');
select pg_temp.expect((public.rr_outreach_today() ->> 'sent_today')::int = 1, 'today counts one sent');
reset role;

------------------------------------------------------------
-- Unsubscribe
------------------------------------------------------------
set local role service_role;
select pg_temp.expect(
  (public.rr_outreach_unsubscribe('0000000000000000000000000000000000000000000000000000000000000000') ->> 'ok')::boolean = false,
  'an unknown token does nothing');
select pg_temp.expect(
  (public.rr_outreach_unsubscribe((select j ->> 'unsubscribe_token' from claim)) ->> 'ok')::boolean,
  'the unsubscribe link works');
reset role;
select pg_temp.expect(
  (select count(*) from public.outreach_suppressions where value = 'layla@falconbay.example' and reason = 'unsubscribed') = 1,
  'the address is suppressed');
select pg_temp.expect(
  (select status from public.outreach_messages where id = (select good from ids)) = 'unsubscribed',
  'the email shows unsubscribed');

select pg_temp.human('admin');
select pg_temp.expect(
  (public.rr_outreach_import_stage('again.csv', '[{"company":"Brand New Co","email":"layla@falconbay.example"}]'::jsonb) ->> 'blocked_count')::int = 1,
  'a later import skips the unsubscribed address');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_outreach_edit((select good from ids), 'other@falconbay.example', 'x', 'y')$$),
  'a sent email cannot be edited');
select pg_temp.expect(
  (select status from public.rr_outreach_decide((select noemail from ids), 'pass', 'Not now')) = 'passed',
  'pass sets passed');
reset role;

rollback;
