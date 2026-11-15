begin;
\ir _fixtures.sql

-- service_role / superuser can hit the rate limit function
select pg_temp.expect(public.rr_rate_limit_hit('test:bucket', 2, 60) = true, 'first hit allowed');
select pg_temp.expect(public.rr_rate_limit_hit('test:bucket', 2, 60) = true, 'second hit allowed');
select pg_temp.expect(public.rr_rate_limit_hit('test:bucket', 2, 60) = false, 'third hit blocked');

select pg_temp.login('sales');
select pg_temp.expect(
  pg_temp.fails($q$select public.rr_rate_limit_hit('sales:bucket', 10, 60)$q$),
  'authenticated cannot call rate limit rpc');
reset role;

rollback;
