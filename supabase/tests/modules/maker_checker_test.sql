-- Maker-checker access and four-eyes rules (docs/modules/maker-checker.md).
begin;
\ir _fixtures.sql

-- Policy lookup
select pg_temp.login('sales');
select pg_temp.expect(public.rr_approval_required('payroll.run', null), 'payroll.run always needs a checker');
select pg_temp.expect(not public.rr_approval_required('expense.large', 9999.99), 'expense below limit needs no checker');
select pg_temp.expect(public.rr_approval_required('expense.large', 10000), 'expense at limit needs a checker');
select pg_temp.expect(not public.rr_approval_required('unknown.action', 1), 'unknown action needs no checker');

-- Policies: members read, only admin writes
select pg_temp.expect((select count(*) from public.approval_policies) >= 3, 'sales reads policies');
select pg_temp.expect(pg_temp.fails($q$insert into public.approval_policies (action_key, label) values ('x.y', 'X')$q$), 'sales cannot add a policy');
select pg_temp.login('manager');
select pg_temp.expect(pg_temp.fails($q$insert into public.approval_policies (action_key, label) values ('x.y', 'X')$q$), 'manager cannot add a policy');
select pg_temp.login('admin');
select pg_temp.expect(not pg_temp.fails($q$insert into public.approval_policies (action_key, label) values ('x.y', 'X')$q$), 'admin adds a policy');

-- Sales raises a request; maker is forced to the signed in user
select pg_temp.login('sales');
insert into public.approval_requests (id, action_key, summary, amount, maker_email, status)
values ('c0000000-0000-4000-8000-0000000000a1', 'payment.refund', 'Refund RR-1', 500, 'someone@else.ae', 'approved');
select pg_temp.expect(
  (select maker_email = 'mt-sales@redreach.ae' and status = 'pending' from public.approval_requests where id = 'c0000000-0000-4000-8000-0000000000a1'),
  'maker and pending status cannot be forged on insert');
select pg_temp.expect(pg_temp.fails($q$update public.approval_requests set status = 'approved' where id = 'c0000000-0000-4000-8000-0000000000a1'$q$), 'no direct update of a request');
select pg_temp.expect(pg_temp.fails($q$delete from public.approval_requests where id = 'c0000000-0000-4000-8000-0000000000a1'$q$), 'no direct delete of a request');
select pg_temp.expect(pg_temp.fails($q$select public.rr_approval_decide('c0000000-0000-4000-8000-0000000000a1', true, '')$q$), 'sales cannot decide');

-- Viewer cannot ask and sees nothing of others; staff sees only own
select pg_temp.login('viewer');
select pg_temp.expect(pg_temp.fails($q$insert into public.approval_requests (action_key, summary) values ('payment.refund', 'x')$q$), 'viewer cannot raise a request');
select pg_temp.expect((select count(*) from public.approval_requests) = 0, 'viewer sees no one else''s requests');
select pg_temp.login('staff');
insert into public.approval_requests (id, action_key, summary) values ('c0000000-0000-4000-8000-0000000000a2', 'expense.large', 'Laptop');
select pg_temp.expect((select count(*) from public.approval_requests) = 1, 'staff sees only own request');
select pg_temp.expect(pg_temp.fails($q$select public.rr_approval_decide('c0000000-0000-4000-8000-0000000000a2', true, '')$q$), 'staff cannot decide');

-- Manager raises one; manager cannot approve own (four eyes), admin can
select pg_temp.login('manager');
insert into public.approval_requests (id, action_key, summary, amount) values ('c0000000-0000-4000-8000-0000000000a3', 'payroll.run', 'November payroll', 42000);
select pg_temp.expect(pg_temp.fails($q$select public.rr_approval_decide('c0000000-0000-4000-8000-0000000000a3', true, 'ok')$q$), 'maker cannot approve own request');
select pg_temp.expect(pg_temp.fails($q$select public.rr_approval_decide('c0000000-0000-4000-8000-0000000000a1', false, '  ')$q$), 'reject needs a reason');
select pg_temp.expect((select (public.rr_approval_decide('c0000000-0000-4000-8000-0000000000a1', false, 'Wrong amount')).status) = 'rejected', 'manager rejects sales request with reason');
select pg_temp.expect(pg_temp.fails($q$select public.rr_approval_decide('c0000000-0000-4000-8000-0000000000a1', true, '')$q$), 'decided request cannot be decided again');
select pg_temp.login('admin');
select pg_temp.expect(
  (select r.status = 'approved' and r.checker_email = 'mt-admin@redreach.ae'
   from public.rr_approval_decide('c0000000-0000-4000-8000-0000000000a3', true, '') r),
  'admin approves manager request and is recorded as checker');

-- Cancel: only the maker, only while pending
select pg_temp.expect(pg_temp.fails($q$select public.rr_approval_cancel('c0000000-0000-4000-8000-0000000000a2')$q$), 'admin cannot cancel someone else''s request');
select pg_temp.login('staff');
select pg_temp.expect((select (public.rr_approval_cancel('c0000000-0000-4000-8000-0000000000a2')).status) = 'cancelled', 'maker cancels own pending request');

-- Cross tenant
select pg_temp.login('b_admin');
select pg_temp.expect((select count(*) from public.approval_requests) = 0, 'tenant B sees no tenant A requests');
select pg_temp.expect((select count(*) from public.approval_policies) = 0, 'tenant B sees no tenant A policies');
select pg_temp.expect(pg_temp.fails($q$select public.rr_approval_decide('c0000000-0000-4000-8000-0000000000a2', true, '')$q$), 'tenant B cannot decide tenant A request');
select pg_temp.expect(pg_temp.fails($q$insert into public.approval_requests (tenant_id, action_key, summary) values ('a0000000-0000-4000-8000-000000000001', 'x.y', 'x')$q$), 'tenant B cannot insert into tenant A');

-- Stranger and anon
select pg_temp.login('stranger');
select pg_temp.expect((select count(*) from public.approval_requests) = 0, 'stranger sees nothing');
select pg_temp.expect(pg_temp.fails($q$insert into public.approval_requests (action_key, summary) values ('x.y', 'x')$q$), 'stranger cannot raise');
reset role;
set local role anon;
select pg_temp.expect(pg_temp.fails('select 1 from public.approval_requests'), 'anon cannot read requests');
reset role;

-- Audit trail written
select pg_temp.expect((select count(*) from public.audit_log where table_name = 'approval_requests') >= 4, 'decisions land in audit_log');

rollback;
