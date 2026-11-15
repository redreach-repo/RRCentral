begin;
\ir _fixtures.sql

insert into public.accounts (id, tenant_id, type, name, reference, status)
values (
  'e8300000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'ai_crm_client',
  'PO Receipt Co',
  'AC-07-26998',
  'active'
);

select pg_temp.login('admin');
insert into public.client_purchase_orders (
  id, tenant_id, account_id, po_number, amount, received_amount, status
) values (
  'e8400000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'e8300000-0000-4000-8000-000000000001',
  'CPO-1',
  1000,
  250,
  'partial'
);

select pg_temp.expect(
  (select received_amount from public.client_purchase_orders where id = 'e8400000-0000-4000-8000-000000000001') = 250,
  'client PO received_amount persists');
reset role;

rollback;
