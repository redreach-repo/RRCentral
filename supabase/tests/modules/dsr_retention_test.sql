begin;
\ir _fixtures.sql

select pg_temp.login('admin');
insert into public.dsr_requests (tenant_id, request_type, subject_email, status)
values ('a0000000-0000-4000-8000-000000000001', 'access', 'subject@example.com', 'received');
select pg_temp.expect((select count(*) from public.dsr_requests) = 1, 'admin can create DSR request');

select public.rr_retention_run(interval '90 days', interval '2 years');
select pg_temp.expect((select count(*) from public.retention_runs) = 1, 'admin retention prune logs a run');
reset role;

select pg_temp.login('sales');
select pg_temp.expect(
  pg_temp.fails($q$insert into public.dsr_requests (request_type, subject_email) values ('access', 'x@y.z')$q$),
  'sales cannot create DSR requests');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect(
  (select count(*) from public.dsr_requests where tenant_id = 'a0000000-0000-4000-8000-000000000001') = 0,
  'tenant B cannot see tenant A DSR');
reset role;

rollback;
