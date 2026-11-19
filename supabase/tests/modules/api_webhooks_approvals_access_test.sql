-- API keys and webhooks: admin only. Approvals: managers decide, team raises
-- and sees their own, viewers nothing.
begin;
\ir _fixtures.sql

insert into public.api_keys (id, tenant_id, name, key_prefix, key_hash)
values ('e6000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Test key', 'rk_test', 'hash')
on conflict do nothing;

-- Sales, staff, viewer: no API keys or webhooks.
do $$
declare
  who text;
begin
  foreach who in array array['manager', 'sales', 'staff', 'viewer']
  loop
    perform pg_temp.login(who);
    perform pg_temp.expect((select count(*) from public.api_keys) = 0, who || ' cannot read API keys');
    perform pg_temp.expect((select count(*) from public.webhook_endpoints) = 0, who || ' cannot read webhooks');
    perform pg_temp.expect(
      pg_temp.fails($q$insert into public.api_keys (tenant_id, name, key_prefix, key_hash)
        values ('a0000000-0000-4000-8000-000000000001', 'Sneaky', 'rk_x', 'h')$q$),
      who || ' cannot create API keys');
    reset role;
  end loop;
end $$;

select pg_temp.login('admin');
select pg_temp.expect((select count(*) from public.api_keys where id = 'e6000000-0000-4000-8000-000000000001') = 1, 'admin reads API keys');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect((select count(*) from public.api_keys where id = 'e6000000-0000-4000-8000-000000000001') = 0, 'tenant B cannot see tenant A API keys');
reset role;

-- Sales raises a request and sees only their own.
insert into public.approval_requests (id, tenant_id, object_type, object_id, action, status, requested_by)
values ('e6100000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'expense', 'x', 'approve', 'pending',
        (select id from public.app_users where email = 'mt-staff@redreach.ae'))
on conflict do nothing;

select pg_temp.login('sales');
insert into public.approval_requests (id, object_type, object_id, action, status, requested_by)
values ('e6100000-0000-4000-8000-000000000002', 'expense', 'y', 'approve', 'pending', public.rr_current_user_id());
select pg_temp.expect((select count(*) from public.approval_requests) = 1, 'sales sees only own approval requests');
select pg_temp.expect(
  pg_temp.fails($q$insert into public.approval_requests (object_type, object_id, action, status) values ('expense', 'z', 'approve', 'approved')$q$),
  'sales cannot insert an already approved request');
select pg_temp.expect(
  pg_temp.fails($q$update public.approval_requests set status = 'approved' where id = 'e6100000-0000-4000-8000-000000000002'$q$),
  'sales cannot approve own request');
update public.approval_requests set status = 'canceled' where id = 'e6100000-0000-4000-8000-000000000002';
reset role;
select pg_temp.expect((select status from public.approval_requests where id = 'e6100000-0000-4000-8000-000000000002') = 'canceled', 'sales can cancel own pending request');

select pg_temp.login('viewer');
select pg_temp.expect((select count(*) from public.approval_requests) = 0, 'viewer cannot read approvals');
select pg_temp.expect(
  pg_temp.fails($q$insert into public.approval_requests (object_type, object_id, action, status) values ('expense', 'v', 'approve', 'pending')$q$),
  'viewer cannot raise approvals');
reset role;

select pg_temp.login('manager');
select pg_temp.expect((select count(*) from public.approval_requests where tenant_id = 'a0000000-0000-4000-8000-000000000001') >= 2, 'manager sees every request');
update public.approval_requests set status = 'approved' where id = 'e6100000-0000-4000-8000-000000000001';
reset role;
select pg_temp.expect((select status from public.approval_requests where id = 'e6100000-0000-4000-8000-000000000001') = 'approved', 'manager can approve');

rollback;
