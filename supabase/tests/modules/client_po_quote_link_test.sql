-- Link a client PO to its quote, even after the quote expired
-- (20261330090000_client_po_quote_link.sql). One access check per role.
begin;
\ir _fixtures.sql

insert into public.clients (id, company_name, tenant_id)
values ('e9900000-0000-4000-8000-000000000001', 'Late PO Client LLC', 'a0000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

-- Quote expired on 20 Nov; PO dated 26 Nov (6 days late).
insert into public.quotations (id, client, reference_number, base_reference, quote_id, date, valid_until, amount, status, division_code, tenant_id)
values
  ('e9900000-0000-4000-8000-0000000000b1', 'Late PO Client LLC', 'RR-01-26100', 'RR-01-26100', 'Q-26100',
   '2026-11-06', '2026-11-20', 5000, 'Expired', '01', 'a0000000-0000-4000-8000-000000000001'),
  ('e9900000-0000-4000-8000-0000000000b2', 'Late PO Client LLC', '', '', 'Q-DRAFT',
   '2026-11-20', null, 100, 'Draft', '01', 'a0000000-0000-4000-8000-000000000001'),
  ('e9900000-0000-4000-8000-0000000000b3', 'Late PO Client LLC', 'RR-01-26101', 'RR-01-26101', 'Q-26101',
   '2026-11-01', '2026-11-15', 900, 'Superseded', '01', 'a0000000-0000-4000-8000-000000000001'),
  ('e9900000-0000-4000-8000-0000000000b4', 'Someone Else', 'RR-01-26102', 'RR-01-26102', 'Q-26102',
   '2026-11-20', '2026-12-04', 700, 'Sent', '01', 'a0000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.client_purchase_orders (id, tenant_id, client_id, po_number, amount, issued_on)
values
  ('e9900000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-000000000001',
   'e9900000-0000-4000-8000-000000000001', 'LATE-1', 5250, '2026-11-26'),
  ('e9900000-0000-4000-8000-0000000000a2', 'a0000000-0000-4000-8000-000000000001',
   'e9900000-0000-4000-8000-000000000001', 'ONTIME-2', 700, '2026-11-25');

-- Re-running the migration keeps working.
\ir ../../migrations/20261330090000_client_po_quote_link.sql
set client_min_messages = notice;

------------------------------------------------------------
-- sales: link a PO to an Expired quote, no revision needed
------------------------------------------------------------
select pg_temp.login('sales');
select pg_temp.expect(
  (select (r ->> 'awarded')::boolean and (r ->> 'after_expiry')::boolean and (r ->> 'days_after_expiry')::int = 6
          and r ->> 'previous_status' = 'Expired' and not (r ->> 'client_mismatch')::boolean
     from (select public.rr_client_po_link_quote('e9900000-0000-4000-8000-0000000000a1',
                                                 'e9900000-0000-4000-8000-0000000000b1', true) r) x),
  'sales links a PO to an Expired quote, 6 days late, and awards it');
select pg_temp.expect(
  (select quotation_id = 'e9900000-0000-4000-8000-0000000000b1' and quote_reference = 'RR-01-26100'
          and quote_valid_until = '2026-11-20' and after_quote_expiry and quote_linked_by = 'mt-sales@redreach.ae'
     from public.client_purchase_orders where id = 'e9900000-0000-4000-8000-0000000000a1'),
  'the PO keeps the quote number, its validity date and "after expiry"');
select pg_temp.expect(
  (select status = 'Awarded' and reference_number = 'RR-01-26100' and amount = 5000 and outcome_reason = 'Client PO LATE-1'
     from public.quotations where id = 'e9900000-0000-4000-8000-0000000000b1'),
  'quote is Awarded; its number and total are unchanged');
select pg_temp.expect(
  (select count(*) = 1 from public.quote_notes
    where quotation_id = 'e9900000-0000-4000-8000-0000000000b1'
      and body like 'Client PO LATE-1 linked (PO dated 26 Nov 2026). The PO came 6 days after%Awarded (was Expired).'),
  'the quote notes log says the PO came late');

-- linking without awarding, client mismatch is reported (not blocked), on-time PO is not "late"
select pg_temp.expect(
  (select not (r ->> 'awarded')::boolean and not (r ->> 'after_expiry')::boolean and (r ->> 'client_mismatch')::boolean
     from (select public.rr_client_po_link_quote('e9900000-0000-4000-8000-0000000000a2',
                                                 'e9900000-0000-4000-8000-0000000000b4', false) r) x),
  'link without award; on-time PO; different client name is flagged');
select pg_temp.expect(
  (select status = 'Sent' from public.quotations where id = 'e9900000-0000-4000-8000-0000000000b4'),
  'quote status untouched when award is off');

-- Superseded: linked, never awarded
select pg_temp.expect(
  (select not (r ->> 'awarded')::boolean
     from (select public.rr_client_po_link_quote('e9900000-0000-4000-8000-0000000000a2',
                                                 'e9900000-0000-4000-8000-0000000000b3', true) r) x),
  'a Superseded quote can be linked but is not awarded');
select pg_temp.expect(
  (select status = 'Superseded' from public.quotations where id = 'e9900000-0000-4000-8000-0000000000b3'),
  'Superseded quote stays Superseded');

-- Draft quotes cannot take a PO
select pg_temp.expect(
  pg_temp.fails($$select public.rr_client_po_link_quote('e9900000-0000-4000-8000-0000000000a2',
                                                       'e9900000-0000-4000-8000-0000000000b2', true)$$),
  'a Draft quote cannot be linked');

-- Changing the PO date updates "after expiry"
update public.client_purchase_orders set issued_on = '2026-11-14' where id = 'e9900000-0000-4000-8000-0000000000a2';
select pg_temp.expect(
  (select not after_quote_expiry from public.client_purchase_orders where id = 'e9900000-0000-4000-8000-0000000000a2'),
  'PO dated inside validity is not after expiry');

-- unlink keeps the quote status
select public.rr_client_po_unlink_quote('e9900000-0000-4000-8000-0000000000a2');
select pg_temp.expect(
  (select quotation_id is null and quote_reference = '' and not after_quote_expiry
     from public.client_purchase_orders where id = 'e9900000-0000-4000-8000-0000000000a2'),
  'unlink clears the link');
reset role;

------------------------------------------------------------
-- manager and admin can link too
------------------------------------------------------------
select pg_temp.login('manager');
select public.rr_client_po_link_quote('e9900000-0000-4000-8000-0000000000a2', 'e9900000-0000-4000-8000-0000000000b4', false);
select pg_temp.expect(
  (select count(*) = 1 from public.client_purchase_orders where quotation_id = 'e9900000-0000-4000-8000-0000000000b4'),
  'manager can link');
reset role;
select pg_temp.login('admin');
select public.rr_client_po_unlink_quote('e9900000-0000-4000-8000-0000000000a2');
select pg_temp.expect(
  (select quotation_id is null from public.client_purchase_orders where id = 'e9900000-0000-4000-8000-0000000000a2'),
  'admin can unlink');
reset role;

------------------------------------------------------------
-- viewer, staff, stranger, other tenant: cannot link
------------------------------------------------------------
select pg_temp.login('viewer');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_client_po_link_quote('e9900000-0000-4000-8000-0000000000a2',
                                                       'e9900000-0000-4000-8000-0000000000b4', true)$$),
  'viewer cannot link');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_client_po_unlink_quote('e9900000-0000-4000-8000-0000000000a1')$$),
  'viewer cannot unlink');
reset role;
select pg_temp.login('staff');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_client_po_link_quote('e9900000-0000-4000-8000-0000000000a2',
                                                       'e9900000-0000-4000-8000-0000000000b4', true)$$),
  'staff role cannot link');
reset role;
select pg_temp.login('stranger');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_client_po_link_quote('e9900000-0000-4000-8000-0000000000a2',
                                                       'e9900000-0000-4000-8000-0000000000b4', true)$$),
  'stranger cannot link');
reset role;
select pg_temp.login('b_admin');
select pg_temp.expect(
  pg_temp.fails($$select public.rr_client_po_link_quote('e9900000-0000-4000-8000-0000000000a2',
                                                       'e9900000-0000-4000-8000-0000000000b4', true)$$),
  'tenant B admin cannot reach tenant A POs or quotes');
reset role;

select pg_temp.expect(
  (select quotation_id is null from public.client_purchase_orders where id = 'e9900000-0000-4000-8000-0000000000a2'),
  'nothing changed by the refused calls');

rollback;
