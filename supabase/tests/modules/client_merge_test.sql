-- Merging duplicate client records (20261341090000_client_merge.sql):
-- company key, preview, field picks, one-transaction merge, audit entry,
-- undo, merged clients never matched again, one access check per role.
begin;
\ir _fixtures.sql

------------------------------------------------------------
-- Data: Sharjah Ready Mix in three records (25 Nov brief)
------------------------------------------------------------
insert into public.accounts (id, type, name, reference) values
  ('c2000000-0000-4000-8000-0000000000a1', 'rr_threads_client', 'Sharjah Ready Mix', 'AC-07-26901');

insert into public.clients (id, company_name, email, trn, address, contacts, account_id, created_at) values
  ('c2100000-0000-4000-8000-000000000001', 'Sharjah Ready Mix Concrete Company L.L.C SP', 'purchase@sharjahreadymix.ae', '',
     'Industrial Area 6, Sharjah',
     '[{"name":"Vishraj Sasidharan","email":"purchase@sharjahreadymix.ae"}]', null, now() - interval '3 days'),
  ('c2100000-0000-4000-8000-000000000002', 'SHARJAH READYMIX L.L.C', '', '100234567800003', '',
     '[{"name":"Vishraj S","email":"PURCHASE@sharjahreadymix.ae"},{"name":"Accounts","phone":"+971 6 500 0000"}]',
     'c2000000-0000-4000-8000-0000000000a1', now() - interval '2 days'),
  ('c2100000-0000-4000-8000-000000000003', 'Sharjah Readymix Co.', '', '', 'PO Box 1, Sharjah', '[]', null, now() - interval '1 day'),
  ('c2100000-0000-4000-8000-000000000004', 'Green Cement', '', '', '', '[]', null, now());
insert into public.clients (id, company_name, tenant_id) values
  ('c2100000-0000-4000-8000-0000000000b1', 'Sharjah Ready Mix', 'b0000000-0000-4000-8000-000000000001');

insert into public.quotations (id, client, reference_number, quote_id, status, created_by, client_id) values
  ('c2200000-0000-4000-8000-000000000005', 'Sharjah Ready Mix', 'RR-01-26005', 'Q-M5', 'Sent', 'mt-manager@redreach.ae', 'c2100000-0000-4000-8000-000000000001'),
  ('c2200000-0000-4000-8000-000000000006', 'SHARJAH READYMIX', 'RR-01-26006', 'Q-M6', 'Accepted', 'mt-manager@redreach.ae', 'c2100000-0000-4000-8000-000000000002'),
  ('c2200000-0000-4000-8000-000000000008', 'Green Cement', 'RR-01-26008', 'Q-M8', 'Sent', 'mt-manager@redreach.ae', 'c2100000-0000-4000-8000-000000000004');
-- Typed differently and never linked (three possible clients).
insert into public.quotations (id, client, reference_number, quote_id, status, created_by) values
  ('c2200000-0000-4000-8000-000000000007', 'Sharjah ReadyMix LLC', 'RR-01-26007', 'Q-M7', 'Sent', 'mt-manager@redreach.ae');
update public.quotations set client_id = null where id = 'c2200000-0000-4000-8000-000000000007';

insert into public.client_purchase_orders (id, po_number, amount, client_id) values
  ('c2300000-0000-4000-8000-000000000001', '4200050362', 50000, 'c2100000-0000-4000-8000-000000000003');
insert into public.invoices (id, client, reference_number, amount, created_by, client_id) values
  ('c2400000-0000-4000-8000-000000000001', 'Sharjah Readymix', 'RR-01-26006', 26250, 'mt-manager@redreach.ae', 'c2100000-0000-4000-8000-000000000002');

------------------------------------------------------------
-- 1. Company key
------------------------------------------------------------
select pg_temp.expect(public.rr_company_key('Sharjah Ready Mix Concrete Company L.L.C SP') = public.rr_company_key('Sharjah ReadyMix Concrete'),
  'L.L.C SP, Company and Ready Mix/ReadyMix compare equal');
select pg_temp.expect(public.rr_company_key('SHARJAH READYMIX L.L.C') = public.rr_company_key('Sharjah Readymix Co.'),
  'LLC and Co. are ignored, any case');
select pg_temp.expect(public.rr_company_key('Green Cement') <> public.rr_company_key('Sharjah Readymix'), 'different companies differ');

------------------------------------------------------------
-- 2. Access: only admins (people) preview, merge or undo
------------------------------------------------------------
select pg_temp.login('manager');
select pg_temp.expect(pg_temp.fails($q$select public.rr_client_merge_preview('c2100000-0000-4000-8000-000000000002', array['c2100000-0000-4000-8000-000000000001']::uuid[])$q$),
  'a manager cannot preview a merge');
reset role;
select pg_temp.login('sales');
select pg_temp.expect(pg_temp.fails($q$select public.rr_client_merge('c2100000-0000-4000-8000-000000000002', array['c2100000-0000-4000-8000-000000000001']::uuid[], '{}', true, 'MERGE')$q$),
  'sales cannot merge');
reset role;
select pg_temp.login('staff');
select pg_temp.expect(pg_temp.fails($q$select public.rr_client_merge('c2100000-0000-4000-8000-000000000002', array['c2100000-0000-4000-8000-000000000001']::uuid[], '{}', true, 'MERGE')$q$),
  'staff cannot merge');
reset role;
select pg_temp.login('viewer');
select pg_temp.expect(pg_temp.fails($q$select public.rr_client_merge('c2100000-0000-4000-8000-000000000002', array['c2100000-0000-4000-8000-000000000001']::uuid[], '{}', true, 'MERGE')$q$),
  'a viewer cannot merge');
select pg_temp.expect(pg_temp.fails($q$insert into public.client_merges (survivor_id, duplicate_ids, survivor_before, duplicates_before)
  values ('c2100000-0000-4000-8000-000000000002', '{}', '{}', '[]')$q$), 'nobody writes the merge log directly');
reset role;
select pg_temp.login('stranger');
select pg_temp.expect(pg_temp.fails($q$select public.rr_client_merge_preview('c2100000-0000-4000-8000-000000000002', array['c2100000-0000-4000-8000-000000000001']::uuid[])$q$),
  'a stranger cannot preview');
reset role;
select pg_temp.login('b_admin');
select pg_temp.expect(pg_temp.fails($q$select public.rr_client_merge_preview('c2100000-0000-4000-8000-0000000000b1', array['c2100000-0000-4000-8000-000000000001']::uuid[])$q$),
  'an admin of another company cannot touch our clients');
reset role;
select pg_temp.login('admin');
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('request.jwt.claim.sub', true), 'role', 'authenticated',
                    'hm_mcp_key', 'e5900000-0000-4000-8000-0000000000ff')::text, true);
select pg_temp.expect(pg_temp.fails($q$select public.rr_client_merge('c2100000-0000-4000-8000-000000000002', array['c2100000-0000-4000-8000-000000000001']::uuid[], '{}', true, 'MERGE')$q$),
  'the AI connector cannot merge, even with an admin behind it');
select set_config('request.jwt.claims', '', true);

------------------------------------------------------------
-- 3. Preview (admin)
------------------------------------------------------------
select pg_temp.expect(pg_temp.fails($q$select public.rr_client_merge_preview('c2100000-0000-4000-8000-000000000002', array['c2100000-0000-4000-8000-000000000002']::uuid[])$q$),
  'the client kept cannot also be a duplicate');
select pg_temp.expect(pg_temp.fails($q$select public.rr_client_merge_preview('c2100000-0000-4000-8000-000000000002', array['c2100000-0000-4000-8000-0000000000b1']::uuid[])$q$),
  'a client of another company cannot be merged in');

create temp table pv on commit drop as
select public.rr_client_merge_preview('c2100000-0000-4000-8000-000000000002',
  array['c2100000-0000-4000-8000-000000000001', 'c2100000-0000-4000-8000-000000000003']::uuid[]) as p;
grant select on pv to authenticated;
select pg_temp.expect((select (p -> 'moves' ->> 'quotations')::int from pv) = 1, 'preview: one quote moves (RR-01-26005)');
select pg_temp.expect((select (p -> 'moves' ->> 'client_purchase_orders')::int from pv) = 1, 'preview: PO 4200050362 moves');
select pg_temp.expect((select p -> 'moves' -> 'invoices' from pv) is null, 'preview: the invoice already on the kept client is not counted');
select pg_temp.expect((select jsonb_array_length(p -> 'unlinked' -> 'quotations') from pv) = 1, 'preview: unlinked RR-01-26007 is offered');
select pg_temp.expect((select exists (select 1 from jsonb_array_elements(p -> 'fields') f where f ->> 'field' = 'company_name') from pv),
  'preview: the names differ and can be picked');
select pg_temp.expect((select exists (select 1 from jsonb_array_elements(p -> 'fields') f where f ->> 'field' = 'address') from pv),
  'preview: the addresses differ and can be picked');
select pg_temp.expect((select jsonb_array_length(p -> 'contacts') from pv) = 2,
  'preview: contacts combine without repeating the same email (any case)');
select pg_temp.expect((select count(*) from public.client_merges) = 0, 'a preview changes nothing');

------------------------------------------------------------
-- 4. Merge
------------------------------------------------------------
select pg_temp.expect(pg_temp.fails($q$select public.rr_client_merge('c2100000-0000-4000-8000-000000000002',
  array['c2100000-0000-4000-8000-000000000001','c2100000-0000-4000-8000-000000000003']::uuid[], '{}', true, 'yes')$q$),
  'without typing MERGE nothing happens');
select pg_temp.expect(pg_temp.fails($q$select public.rr_client_merge('c2100000-0000-4000-8000-000000000002',
  array['c2100000-0000-4000-8000-000000000001']::uuid[], '{"email":"c2100000-0000-4000-8000-000000000004"}', true, 'MERGE')$q$),
  'a field value must come from one of the merged clients');

create temp table mr on commit drop as
select public.rr_client_merge('c2100000-0000-4000-8000-000000000002',
  array['c2100000-0000-4000-8000-000000000001', 'c2100000-0000-4000-8000-000000000003']::uuid[],
  '{"company_name":"c2100000-0000-4000-8000-000000000001","address":"c2100000-0000-4000-8000-000000000003"}', true, 'MERGE',
  'Sharjah Ready Mix clean up') as r;
grant select on mr to authenticated;
select pg_temp.expect((select c.company_name from public.clients c where c.id = 'c2100000-0000-4000-8000-000000000002') = 'Sharjah Ready Mix Concrete Company L.L.C SP',
  'the picked name is kept');
select pg_temp.expect((select c.address from public.clients c where c.id = 'c2100000-0000-4000-8000-000000000002') = 'PO Box 1, Sharjah',
  'the picked address is kept');
select pg_temp.expect((select c.trn from public.clients c where c.id = 'c2100000-0000-4000-8000-000000000002') = '100234567800003',
  'the kept client keeps its own TRN');
select pg_temp.expect((select c.email from public.clients c where c.id = 'c2100000-0000-4000-8000-000000000002') = 'purchase@sharjahreadymix.ae',
  'a blank email is filled from a duplicate');
select pg_temp.expect((select c.account_id from public.clients c where c.id = 'c2100000-0000-4000-8000-000000000002') = 'c2000000-0000-4000-8000-0000000000a1',
  'the kept client stays on account AC-07-26001');
select pg_temp.expect((select count(*) from public.quotations where client_id = 'c2100000-0000-4000-8000-000000000002'
                        and reference_number in ('RR-01-26005','RR-01-26006','RR-01-26007')) = 3,
  'RR-01-26005, 26006 and 26007 are all on the kept client');
select pg_temp.expect((select client_id from public.client_purchase_orders where id = 'c2300000-0000-4000-8000-000000000001') = 'c2100000-0000-4000-8000-000000000002',
  'PO 4200050362 is on the kept client');
select pg_temp.expect((select q.client from public.quotations q where q.id = 'c2200000-0000-4000-8000-000000000006') = 'SHARJAH READYMIX'
                   and (select q.reference_number from public.quotations q where q.id = 'c2200000-0000-4000-8000-000000000005') = 'RR-01-26005'
                   and (select i.amount from public.invoices i where i.id = 'c2400000-0000-4000-8000-000000000001') = 26250,
  'quote numbers, typed names and totals are never changed');
select pg_temp.expect((select count(*) from public.clients where merged_into = 'c2100000-0000-4000-8000-000000000002' and deleted_at is not null) = 2,
  'both duplicates are soft deleted and point at the kept client');
select pg_temp.expect((select count(*) from public.client_merges where survivor_id = 'c2100000-0000-4000-8000-000000000002') = 1,
  'the merge is logged');
select pg_temp.expect((select merged_by_email from public.client_merges limit 1) = 'mt-admin@redreach.ae', 'the log says who merged');
select pg_temp.expect((select count(*) from public.audit_log where table_name = 'client_merges') >= 1, 'an audit entry is written');
select pg_temp.expect((select (r -> 'counts' ->> 'unlinked_quotations')::int from mr) = 1, 'the unlinked quote was linked');
select pg_temp.expect(pg_temp.fails($q$select public.rr_client_merge('c2100000-0000-4000-8000-000000000004',
  array['c2100000-0000-4000-8000-000000000001']::uuid[], '{}', true, 'MERGE')$q$),
  'a client already merged cannot be merged again');

-- A new quote typed with an old name goes to the kept client, never to a merged one.
insert into public.quotations (id, client, reference_number, quote_id, status, created_by) values
  ('c2200000-0000-4000-8000-000000000009', 'Sharjah Readymix Co.', 'RR-01-26009', 'Q-M9', 'Draft', 'mt-admin@redreach.ae');
select pg_temp.expect(coalesce((select client_id from public.quotations where id = 'c2200000-0000-4000-8000-000000000009'), '00000000-0000-0000-0000-000000000000')
  <> 'c2100000-0000-4000-8000-000000000003', 'a merged client is never matched again');

-- Admins read the log; managers do not.
reset role;
select pg_temp.login('manager');
select pg_temp.expect((select count(*) from public.client_merges) = 0, 'a manager cannot read the merge log');
select pg_temp.expect(pg_temp.fails($q$select public.rr_client_merge_undo((select id from mr_id))$q$) , 'a manager cannot undo');
reset role;

------------------------------------------------------------
-- 5. Undo
------------------------------------------------------------
select pg_temp.login('admin');
-- A quote added to the kept client after the merge stays there.
insert into public.quotations (id, client, reference_number, quote_id, status, created_by, client_id) values
  ('c2200000-0000-4000-8000-000000000010', 'Sharjah Ready Mix', 'RR-01-26010', 'Q-M10', 'Draft', 'mt-admin@redreach.ae', 'c2100000-0000-4000-8000-000000000002');
select public.rr_client_merge_undo((select (r ->> 'merge_id')::uuid from mr), 'test undo');
select pg_temp.expect((select client_id from public.quotations where id = 'c2200000-0000-4000-8000-000000000005') = 'c2100000-0000-4000-8000-000000000001',
  'undo: RR-01-26005 is back on its old client');
select pg_temp.expect((select client_id from public.client_purchase_orders where id = 'c2300000-0000-4000-8000-000000000001') = 'c2100000-0000-4000-8000-000000000003',
  'undo: the PO is back on its old client');
select pg_temp.expect((select client_id from public.quotations where id = 'c2200000-0000-4000-8000-000000000007') is null,
  'undo: the quote linked during the merge is unlinked again');
select pg_temp.expect((select client_id from public.quotations where id = 'c2200000-0000-4000-8000-000000000010') = 'c2100000-0000-4000-8000-000000000002',
  'undo: a quote added after the merge stays');
select pg_temp.expect((select count(*) from public.clients where id in ('c2100000-0000-4000-8000-000000000001','c2100000-0000-4000-8000-000000000003')
                        and merged_into is null and deleted_at is null) = 2, 'undo: the duplicates are back');
select pg_temp.expect((select company_name from public.clients where id = 'c2100000-0000-4000-8000-000000000002') = 'SHARJAH READYMIX L.L.C'
                   and (select address from public.clients where id = 'c2100000-0000-4000-8000-000000000002') = ''
                   and (select jsonb_array_length(contacts) from public.clients where id = 'c2100000-0000-4000-8000-000000000002') = 2,
  'undo: the kept client gets its own fields and contacts back');
select pg_temp.expect((select undone_at is not null from public.client_merges limit 1), 'undo is logged');
select pg_temp.expect(pg_temp.fails($q$select public.rr_client_merge_undo((select (r ->> 'merge_id')::uuid from mr))$q$),
  'a merge cannot be undone twice');
reset role;

select 'client_merge tests done';
rollback;
