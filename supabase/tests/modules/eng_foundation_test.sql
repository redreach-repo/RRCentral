begin;
\ir _fixtures.sql

select pg_temp.login('admin');
insert into public.eng_document_registers (id, tenant_id, doc_no, title, status)
values (
  'e8000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'DR-1',
  'Spec',
  'draft'
);
insert into public.eng_claims (id, tenant_id, claim_no, title, amount_aed, status)
values (
  'e8100000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'CL-1',
  'Delay',
  5000,
  'draft'
);
select pg_temp.expect(
  (select count(*) from public.eng_document_registers where doc_no = 'DR-1') = 1,
  'admin can create eng document');
select pg_temp.expect(
  (select amount_aed from public.eng_claims where id = 'e8100000-0000-4000-8000-000000000001') = 5000,
  'admin can create eng claim');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect(
  (select count(*) from public.eng_document_registers where id = 'e8000000-0000-4000-8000-000000000001') = 0,
  'tenant B cannot see tenant A eng docs');
reset role;

rollback;
