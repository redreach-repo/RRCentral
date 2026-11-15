begin;
\ir _fixtures.sql

insert into public.products (id, sku, name, stock_on_hand)
values ('e4000000-0000-4000-8000-000000000001', 'SKU-PO-1', 'PO Test Item', 0)
on conflict (id) do nothing;

insert into public.purchase_orders (id, tenant_id, po_number, vendor_name, status, landed_cost_aed)
values ('e4100000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'PO-TEST-1', 'Vendor A', 'ordered', 100);

insert into public.purchase_order_lines (id, tenant_id, purchase_order_id, line_no, sku, description, qty_ordered, qty_received, unit_cost)
values ('e4200000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'e4100000-0000-4000-8000-000000000001', 1, 'SKU-PO-1', 'Item', 10, 0, 5);

select pg_temp.login('sales');
select pg_temp.expect(
  (select qty_received from public.rr_po_receive_line('e4200000-0000-4000-8000-000000000001', 4, 'mt-sales@redreach.ae')) = 4,
  'sales can receive PO line');
select pg_temp.expect((select stock_on_hand from public.products where sku = 'SKU-PO-1') = 4, 'stock bumped on receive');
select pg_temp.expect((select status from public.purchase_orders where id = 'e4100000-0000-4000-8000-000000000001') = 'partial', 'PO marked partial');
select pg_temp.expect(
  (select landed_unit_cost from public.purchase_order_lines where id = 'e4200000-0000-4000-8000-000000000001') = 15,
  'landed unit cost = unit 5 + freight share 10');
select pg_temp.expect((select unit_cost from public.products where sku = 'SKU-PO-1') = 15, 'product unit_cost picks up landed');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect(
  (select count(*) from public.purchase_orders where tenant_id = 'a0000000-0000-4000-8000-000000000001') = 0,
  'tenant B cannot see tenant A POs');
reset role;

rollback;
