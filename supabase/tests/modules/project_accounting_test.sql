begin;
\ir _fixtures.sql

insert into public.delivery_projects (id, tenant_id, code, name, status, budget_aed, retention_pct, billed_to_date_aed)
values ('e5000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'PRJ-1', 'Demo project', 'active', 1000, 10, 0);

select pg_temp.login('sales');
insert into public.project_cost_lines (tenant_id, project_id, category, description, amount_aed)
values ('a0000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000001', 'labour', 'Day rate', 250);
select pg_temp.expect((select count(*) from public.project_cost_lines) = 1, 'sales can add project cost');
update public.delivery_projects set billed_to_date_aed = 200 where id = 'e5000000-0000-4000-8000-000000000001';
select pg_temp.expect(
  (select wip_aed from public.rr_project_refresh_wip('e5000000-0000-4000-8000-000000000001')) = 70,
  'WIP = spent 250 − billed 200 + retention hold 20');
insert into public.project_billing_schedules (id, tenant_id, project_id, milestone_label, pct, amount_aed, status)
values ('e5100000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000001', 'Deposit', 25, 100, 'planned');
select pg_temp.expect(
  (select status from public.rr_project_mark_milestone_billed('e5100000-0000-4000-8000-000000000001')) = 'billed',
  'milestone mark billed');
select pg_temp.expect(
  (select billed_to_date_aed from public.delivery_projects where id = 'e5000000-0000-4000-8000-000000000001') = 300,
  'billed_to_date bumps by milestone amount');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect(
  (select count(*) from public.delivery_projects where tenant_id = 'a0000000-0000-4000-8000-000000000001') = 0,
  'tenant B cannot see tenant A projects');
reset role;

rollback;
