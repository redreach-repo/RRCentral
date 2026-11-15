begin;
\ir _fixtures.sql

insert into public.accounts (id, type, name, tenant_id)
values ('e7100000-0000-4000-8000-000000000001', 'ai_crm_client', 'Mkt Client', 'a0000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into public.account_contacts (id, account_id, name, email, marketing_opt_in)
values ('e7200000-0000-4000-8000-000000000001', 'e7100000-0000-4000-8000-000000000001', 'Pat', 'pat@example.com', true)
on conflict (id) do nothing;

insert into public.marketing_campaigns (id, tenant_id, name, channel, status)
values ('e7000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Spring', 'email', 'draft');

select pg_temp.login('sales');
insert into public.marketing_segments (tenant_id, name, filter_json)
values ('a0000000-0000-4000-8000-000000000001', 'Opt-in email', '{"opt_in_only":true,"channel":"email"}'::jsonb);
select pg_temp.expect((select count(*) from public.marketing_segments) = 1, 'sales can create segment');

insert into public.marketing_campaign_recipients (tenant_id, campaign_id, contact_id, status)
values (
  'a0000000-0000-4000-8000-000000000001',
  'e7000000-0000-4000-8000-000000000001',
  'e7200000-0000-4000-8000-000000000001',
  'queued'
);
select pg_temp.expect((select count(*) from public.marketing_campaign_recipients) = 1, 'sales can queue recipient');
reset role;

select pg_temp.login('b_admin');
select pg_temp.expect(
  (select count(*) from public.marketing_segments where tenant_id = 'a0000000-0000-4000-8000-000000000001') = 0,
  'tenant B cannot see tenant A segments');
reset role;

rollback;
