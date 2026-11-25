-- Revise and extend sent quotes (20261329090000_quote_revisions.sql).
-- The Green Cement case from the brief, one access check per role, the
-- one-live-revision rule, append-only notes and what an AI connector key may do.
begin;
\ir _fixtures.sql

-- Green Cement RR-01-26008: Sent, valid until today (25 Nov 2026 in the brief).
insert into public.quotations (id, client, reference_number, base_reference, revision, quote_id, deal_ref, date, valid_until,
                               amount, status, division_code, payment_terms, delivery_terms, moq, notes,
                               currency, quotation_currency, fx_rate, tenant_id, contact_name, contact_email)
values ('f2000000-0000-4000-8000-000000000008', 'Green Cement', 'RR-01-26008', 'RR-01-26008', 0, 'Q-TEST-26008', 'RR-01-26008',
        current_date - 14, current_date, 10500.00, 'Sent', '01', '50% advance', 'Ex works', '100 pcs', 'Colour as sample',
        'AED', 'AED', 1, 'a0000000-0000-4000-8000-000000000001', 'Site manager', 'site@greencement.test')
on conflict (id) do nothing;
insert into public.line_items (doc_type, reference, line_no, description, qty, unit_price, unit_cost, vat_rate, amount, vat_amount, line_total, sku)
values ('Quote', 'Q-TEST-26008', 1, 'Coverall, green', 100, 60, 35, 0.05, 6000, 300, 6300, 'CV-GRN'),
       ('Quote', 'Q-TEST-26008', 2, 'Safety helmet', 100, 40, 22, 0.05, 4000, 200, 4200, 'HL-WHT');

------------------------------------------------------------
-- sales: notes, extend validity, revise
------------------------------------------------------------
select pg_temp.login('sales');
insert into public.quote_notes (quotation_id, body, created_by_email, source, tenant_id)
values ('f2000000-0000-4000-8000-000000000008', 'Met the buyer, they need two more weeks', 'forged@example.com', 'ai',
        'b0000000-0000-4000-8000-000000000001');
select pg_temp.expect((select count(*) from public.quote_notes) = 1, 'sales can add a note to a Sent (locked) quote');
select pg_temp.expect(
  (select created_by_email = 'mt-sales@redreach.ae' and source = 'app' and quote_ref = 'RR-01-26008'
          and tenant_id = 'a0000000-0000-4000-8000-000000000001'
   from public.quote_notes),
  'who, number and tenant come from the session and the quote, not the request');
select pg_temp.expect(pg_temp.fails($q$update public.quote_notes set body = 'changed'$q$), 'notes cannot be changed');
select pg_temp.expect(pg_temp.fails($q$delete from public.quote_notes$q$), 'notes cannot be removed');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.quote_notes (quotation_id, body) values ('f2000000-0000-4000-8000-000000000008', '   ')$q$),
  'a note needs text');

select pg_temp.expect(pg_temp.fails($q$
  select public.rr_quote_extend_validity('f2000000-0000-4000-8000-000000000008', current_date + 14, '')$q$),
  'extending needs a reason');
select pg_temp.expect(pg_temp.fails($q$
  select public.rr_quote_extend_validity('f2000000-0000-4000-8000-000000000008', current_date, 'same day')$q$),
  'extending needs a later date');
select pg_temp.expect(pg_temp.fails($q$
  select public.rr_quote_revise('f2000000-0000-4000-8000-000000000008', current_date - 1, 'past')$q$),
  'a revision cannot be valid until a past date');

select public.rr_quote_extend_validity('f2000000-0000-4000-8000-000000000008', current_date + 14,
                                       'Meeting with Green Cement: extend two weeks');
select pg_temp.expect(
  (select status = 'Sent' and revision = 1 and base_reference = 'RR-01-26008' and valid_until = current_date + 14
          and revised_from = 'f2000000-0000-4000-8000-000000000008' and client = 'Green Cement'
          and payment_terms = '50% advance' and delivery_terms = 'Ex works' and moq = '100 pcs'
          and notes = 'Colour as sample' and contact_email = 'site@greencement.test' and amount = 10500.00
          and deal_ref = 'RR-01-26008' and revision_reason = 'Meeting with Green Cement: extend two weeks'
   from public.quotations where reference_number = 'RR-01-26008-R1'),
  'extend makes RR-01-26008-R1, Sent, valid 14 days on, with client, terms, notes and contact copied');
select pg_temp.expect(
  (select count(*) = 2 and sum(line_total) = 10500 and bool_and(sku <> '') and sum(qty * unit_cost) = 5700
   from public.line_items l join public.quotations q on q.quote_id = l.reference and l.doc_type = 'Quote'
   where q.reference_number = 'RR-01-26008-R1'),
  'every line is copied (description, SKU, qty, price, cost, VAT)');
select pg_temp.expect(
  (select status = 'Superseded' and amount = 10500.00 and valid_until = current_date and reference_number = 'RR-01-26008'
   from public.quotations where id = 'f2000000-0000-4000-8000-000000000008'),
  'the original is Superseded; its number, total and date are unchanged');
select pg_temp.expect(
  (select count(*) = 2 from public.line_items where reference = 'Q-TEST-26008'),
  'the original lines are untouched');
select pg_temp.expect(
  (select count(*) = 1 from public.quote_notes where kind = 'extended' and body like '%Meeting with Green Cement%'
     and quote_ref = 'RR-01-26008-R1' and created_by_email = 'mt-sales@redreach.ae'),
  'the extension records who and why');
select pg_temp.expect(
  (select count(*) = 1 from public.quote_notes
    where kind = 'superseded' and quotation_id = 'f2000000-0000-4000-8000-000000000008' and body like '%RR-01-26008-R1%'),
  'the original gets a note pointing at the revision');
select pg_temp.expect(
  (select count(*) = 4 from public.quote_notes where base_reference = 'RR-01-26008'),
  'the whole chain shares one notes log (note, extended, superseded, finalized)');

select pg_temp.expect(pg_temp.fails($q$
  select public.rr_quote_revise('f2000000-0000-4000-8000-000000000008', current_date + 20, 'old one')$q$),
  'a Superseded quote cannot be revised');

-- Revise R1 -> Draft R2; only one open revision.
select public.rr_quote_revise((select id from public.quotations where reference_number = 'RR-01-26008-R1'), null, 'New prices');
select pg_temp.expect(
  (select status = 'Draft' and revision = 2 and valid_until = current_date + 28
   from public.quotations where reference_number = 'RR-01-26008-R2'),
  'revise makes a Draft RR-01-26008-R2, default valid-until = old + 14 days');
select pg_temp.expect(
  (select status = 'Sent' from public.quotations where reference_number = 'RR-01-26008-R1'),
  'the quote being revised stays live until the revision is finalized');
select pg_temp.expect(pg_temp.fails($q$
  select public.rr_quote_revise((select id from public.quotations where reference_number = 'RR-01-26008-R1'), null, 'again')$q$),
  'only one open revision per base reference');

-- Finalizing the draft by a plain status change (as older screens do) keeps the number and supersedes R1.
update public.quotations set reference_number = 'RR-01-26099', base_reference = 'RR-01-26099', revision = 0, status = 'Finalized'
where reference_number = 'RR-01-26008-R2';
select pg_temp.expect(
  (select status = 'Finalized' and revision = 2 and base_reference = 'RR-01-26008'
   from public.quotations where reference_number = 'RR-01-26008-R2'),
  'a revision keeps its -R number however it is finalized');
select pg_temp.expect(
  (select status = 'Superseded' from public.quotations where reference_number = 'RR-01-26008-R1'),
  'finalizing R2 supersedes R1');
select pg_temp.expect(
  (select count(*) = 1 from public.quotations where base_reference = 'RR-01-26008' and status not in ('Superseded', 'Draft')),
  'exactly one live quote per base reference');
select pg_temp.expect(pg_temp.fails($q$
  update public.quotations set status = 'Draft' where reference_number = 'RR-01-26008-R2'$q$),
  'a finalized revision cannot go back to Draft');
reset role;

-- A revision cannot replace a quote the client accepted.
update public.quotations set status = 'Accepted' where reference_number = 'RR-01-26008-R2';
select pg_temp.login('sales');
select pg_temp.expect(pg_temp.fails($q$
  select public.rr_quote_revise((select id from public.quotations where reference_number = 'RR-01-26008-R2'), null, 'x')$q$),
  'an Accepted quote cannot be revised');
reset role;
update public.quotations set status = 'Finalized' where reference_number = 'RR-01-26008-R2';

------------------------------------------------------------
-- manager and admin
------------------------------------------------------------
select pg_temp.login('manager');
insert into public.quote_notes (quotation_id, body)
values ((select id from public.quotations where reference_number = 'RR-01-26008-R2'), 'Manager approved the new prices');
select pg_temp.expect((select count(*) from public.quote_notes where body = 'Manager approved the new prices') = 1,
  'manager can add a note');
select pg_temp.expect(pg_temp.fails($q$delete from public.quote_notes$q$), 'manager cannot remove notes either');
reset role;

select pg_temp.login('admin');
select public.rr_quote_revise((select id from public.quotations where reference_number = 'RR-01-26008-R2'), current_date + 30, 'Admin revision');
select pg_temp.expect((select count(*) = 1 from public.quotations where reference_number = 'RR-01-26008-R3' and status = 'Draft'),
  'admin can revise');
select (public.rr_quote_finalize_revision((select id from public.quotations where reference_number = 'RR-01-26008-R3'))) is not null;
select pg_temp.expect((select status from public.quotations where reference_number = 'RR-01-26008-R3') = 'Finalized',
  'admin can finalize a revision');
select pg_temp.expect(pg_temp.fails($q$
  select public.rr_quote_finalize_revision('f2000000-0000-4000-8000-000000000008')$q$),
  'only a draft revision goes through finalize revision');
reset role;

------------------------------------------------------------
-- viewer: read notes only
------------------------------------------------------------
select pg_temp.login('viewer');
select pg_temp.expect((select count(*) from public.quote_notes) >= 6, 'viewer reads quote notes');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.quote_notes (quotation_id, body) values ('f2000000-0000-4000-8000-000000000008', 'viewer')$q$),
  'viewer cannot add a note');
select pg_temp.expect(pg_temp.fails($q$
  select public.rr_quote_revise((select id from public.quotations where reference_number = 'RR-01-26008-R3'), null, 'viewer')$q$),
  'viewer cannot revise');
select pg_temp.expect(pg_temp.fails($q$
  select public.rr_quote_extend_validity((select id from public.quotations where reference_number = 'RR-01-26008-R3'), current_date + 60, 'viewer')$q$),
  'viewer cannot extend');
reset role;

------------------------------------------------------------
-- staff role, strangers and other tenants: nothing
------------------------------------------------------------
select pg_temp.login('staff');
select pg_temp.expect((select count(*) from public.quote_notes) = 0, 'staff role cannot read quote notes');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.quote_notes (quotation_id, body) values ('f2000000-0000-4000-8000-000000000008', 'staff')$q$),
  'staff role cannot add a note');
select pg_temp.expect(pg_temp.fails($q$
  select public.rr_quote_revise('f2000000-0000-4000-8000-000000000008', null, 'staff')$q$),
  'staff role cannot revise');
reset role;

select pg_temp.login('stranger');
select pg_temp.expect((select count(*) from public.quote_notes) = 0, 'stranger sees no notes');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect((select count(*) from public.quote_notes) = 0, 'tenant B cannot see tenant A notes');
select pg_temp.expect(pg_temp.fails($q$
  insert into public.quote_notes (quotation_id, body) values ('f2000000-0000-4000-8000-000000000008', 'from B')$q$),
  'tenant B cannot add a note to a tenant A quote');
select pg_temp.expect(pg_temp.fails($q$
  select public.rr_quote_revise((select id from public.quotations where reference_number = 'RR-01-26008-R3'), null, 'from B')$q$),
  'tenant B cannot revise a tenant A quote');
reset role;

------------------------------------------------------------
-- AI connector: a standard (sales) key adds notes, never revises
------------------------------------------------------------
create or replace function pg_temp.login_mcp(who text, key uuid) returns void language plpgsql as $$
begin
  perform pg_temp.login(who);
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('request.jwt.claim.sub', true), 'role', 'authenticated', 'hm_mcp_key', key)::text, true);
end $$;
create or replace function pg_temp.logout() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

select pg_temp.login('admin');
insert into public.mcp_keys (id, name, key_prefix, key_hash, role, acts_as_user_id, created_by)
select 'f2900000-0000-4000-8000-000000000001', 'Quote test key', 'hmk_quot', repeat('8', 64), 'sales', u.id, 'mt-admin@redreach.ae'
from public.app_users u where u.email = 'mt-sales@redreach.ae';
reset role;

select pg_temp.login_mcp('sales', 'f2900000-0000-4000-8000-000000000001');
insert into public.quote_notes (id, quotation_id, body)
values ('f2100000-0000-4000-8000-000000000001', (select id from public.quotations where reference_number = 'RR-01-26008-R3'),
        'AI: client asked for the PDF again');
select pg_temp.expect((select source from public.quote_notes where id = 'f2100000-0000-4000-8000-000000000001') = 'ai',
  'a standard AI key can add a note, marked ai');
select pg_temp.expect(pg_temp.fails($q$
  select public.rr_quote_extend_validity((select id from public.quotations where reference_number = 'RR-01-26008-R3'), current_date + 60, 'AI')$q$),
  'a standard AI key cannot extend (it creates a quote)');
select pg_temp.expect(pg_temp.fails($q$delete from public.quote_notes$q$), 'an AI key cannot remove notes');
reset role;
select pg_temp.logout();

------------------------------------------------------------
-- AI connector: admin keys with departments follow quotes
------------------------------------------------------------
insert into auth.users values ('00000000-0000-0000-0000-0000000001c2', 'ai-quotes@redreach.ae', now())
on conflict (id) do nothing;
insert into public.app_users (email, name, role, active, tenant_id)
values ('ai-quotes@redreach.ae', 'AI Quotes', 'admin', true, 'a0000000-0000-4000-8000-000000000001')
on conflict (email) do update set role = 'admin', active = true;

create or replace function pg_temp.login_ai(key uuid) returns void language plpgsql as $$
declare sub text;
begin
  select x.id::text into sub from auth.users x join public.app_users u on lower(u.email) = lower(x.email)
  join public.mcp_keys k on k.acts_as_user_id = u.id where k.id = key;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', sub, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', sub, 'role', 'authenticated', 'hm_mcp_key', key)::text, true);
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

select pg_temp.login('admin');
insert into public.mcp_keys (id, name, key_prefix, key_hash, role, scope, assistant, departments, acts_as_user_id, created_by)
select v.id::uuid, v.name, 'hmk_qd', v.hash, 'admin', 'admin', 'grok', v.depts::text[], u.id, 'mt-admin@redreach.ae'
from public.app_users u,
  (values ('f2910000-0000-4000-8000-000000000001', 'Quotes sales', repeat('4', 64), '{sales}'),
          ('f2910000-0000-4000-8000-000000000002', 'Quotes HR', repeat('3', 64), '{hr}')
  ) as v(id, name, hash, depts)
where u.email = 'ai-quotes@redreach.ae';
reset role;

select pg_temp.login_ai('f2910000-0000-4000-8000-000000000001');
select public.rr_quote_extend_validity((select id from public.quotations where reference_number = 'RR-01-26008-R3'),
                                       current_date + 45, 'AI: buyer asked for more time');
select pg_temp.expect(
  (select status = 'Finalized' and valid_until = current_date + 45 from public.quotations where reference_number = 'RR-01-26008-R4'),
  'an admin sales key can extend validity (R4, same status as before)');
select pg_temp.expect(
  (select status from public.quotations where reference_number = 'RR-01-26008-R3') = 'Superseded',
  'the AI extension supersedes the old revision');
reset role;
select pg_temp.logout();
select pg_temp.expect(
  (select count(*) >= 2 from public.audit_log where operation = 'MCP_WRITE'
     and new_data ->> 'tool' in ('extend_quote_validity', 'finalize_quote_revision')),
  'an AI extension is written to the audit log');

select pg_temp.login_ai('f2910000-0000-4000-8000-000000000002');
select pg_temp.expect((select count(*) from public.quote_notes) = 0, 'an HR key cannot read quote notes');
select pg_temp.expect(pg_temp.fails($q$
  select public.rr_quote_revise((select id from public.quotations where reference_number = 'RR-01-26008-R4'), null, 'HR')$q$),
  'an HR key cannot revise quotes');
reset role;
select pg_temp.logout();

rollback;
