begin;
\ir _fixtures.sql

insert into public.accounts (id, type, name, tenant_id)
values ('e6000000-0000-4000-8000-000000000001', 'ai_crm_client', 'PO Client', 'a0000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

select pg_temp.login('sales');
insert into public.client_purchase_orders (tenant_id, account_id, po_number, amount, status)
values ('a0000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', 'CPO-1', 5000, 'open');
select pg_temp.expect((select count(*) from public.client_purchase_orders) = 1, 'sales can create client PO');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect(
  (select count(*) from public.client_purchase_orders where tenant_id = 'a0000000-0000-4000-8000-000000000001') = 0,
  'tenant B cannot see tenant A client POs');
reset role;

rollback;
