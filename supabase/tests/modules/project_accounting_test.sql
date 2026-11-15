begin;
\ir _fixtures.sql

insert into public.delivery_projects (id, tenant_id, code, name, status, budget_aed)
values ('e5000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'PRJ-1', 'Demo project', 'active', 1000);

select pg_temp.login('sales');
insert into public.project_cost_lines (tenant_id, project_id, category, description, amount_aed)
values ('a0000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000001', 'labour', 'Day rate', 250);
select pg_temp.expect((select count(*) from public.project_cost_lines) = 1, 'sales can add project cost');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect(
  (select count(*) from public.delivery_projects where tenant_id = 'a0000000-0000-4000-8000-000000000001') = 0,
  'tenant B cannot see tenant A projects');
reset role;

rollback;
