-- M7 ledger: balance, post, immutability, role + tenant isolation.
begin;
\ir _fixtures.sql

insert into public.gl_accounts (id, tenant_id, code, name, account_type)
values
  ('e1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'T-1000', 'Test cash', 'asset'),
  ('e1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'T-4000', 'Test revenue', 'revenue'),
  ('e1000000-0000-4000-8000-0000000000b1', 'b0000000-0000-4000-8000-000000000001', 'T-1000', 'B cash', 'asset')
on conflict do nothing;

insert into public.gl_journals (id, tenant_id, journal_number, memo, status)
values ('e2000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'J-TEST-1', 'Balanced draft', 'draft');

insert into public.gl_journal_lines (tenant_id, journal_id, account_id, line_no, debit, credit)
values
  ('a0000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 1, 100, 0),
  ('a0000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', 2, 0, 100);

select pg_temp.expect(public.rr_gl_journal_balanced('e2000000-0000-4000-8000-000000000001'), 'draft journal balanced');

select pg_temp.login('manager');
select pg_temp.expect(
  (select status from public.rr_gl_post_journal('e2000000-0000-4000-8000-000000000001')) = 'posted',
  'manager can post balanced journal');
reset role;

select pg_temp.expect(
  pg_temp.fails($q$update public.gl_journal_lines set debit = 50 where journal_id = 'e2000000-0000-4000-8000-000000000001' and line_no = 1$q$),
  'posted lines immutable');

select pg_temp.login('sales');
select pg_temp.expect(
  (select count(*) from public.gl_accounts where code = 'T-1000') = 0,
  'sales cannot read gl_accounts');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect(
  (select count(*) from public.gl_accounts where tenant_id = 'a0000000-0000-4000-8000-000000000001') = 0,
  'tenant B cannot see tenant A accounts');
reset role;

-- Seeded starter CoA present for Red Reach
select pg_temp.expect(
  (select count(*) >= 10 from public.gl_accounts where tenant_id = 'a0000000-0000-4000-8000-000000000001' and code ~ '^[0-9]'),
  'starter CoA seeded');

rollback;
