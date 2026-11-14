-- Public API keys + webhooks: access per role, secrets never readable (docs/modules/public-api.md).
begin;
\ir _fixtures.sql

-- Only admin creates keys; plain key returned once, only the hash stored
select pg_temp.login('manager');
select pg_temp.expect(pg_temp.fails($q$select * from public.rr_api_key_create('M', array['accounts:read'])$q$), 'manager cannot create an API key');
select pg_temp.login('admin');
create temp table k on commit drop as select * from public.rr_api_key_create('Zapier', array['accounts:read', 'invoices:read']);
select pg_temp.expect((select api_key ~ '^hm_[0-9a-f]{64}$' from k), 'key format hm_ + 64 hex');
select pg_temp.expect(pg_temp.fails($q$select * from public.rr_api_key_create('Bad', array['crm:write'])$q$), 'unknown scope refused');
select pg_temp.expect(pg_temp.fails($q$select * from public.rr_api_key_create('None', array[]::text[])$q$), 'empty scopes refused');
select pg_temp.expect((select count(*) from public.api_keys) = 1, 'admin sees key metadata');
select pg_temp.expect(pg_temp.fails('select key_hash from public.api_keys'), 'admin cannot read key hashes');
select pg_temp.expect(pg_temp.fails($q$insert into public.api_keys (name, key_prefix, key_hash) values ('x', 'x', repeat('a', 64))$q$), 'no direct insert of keys');
reset role;
select pg_temp.expect(
  (select a.key_hash = public.rr_sha256_hex(k.api_key) and a.key_prefix = left(k.api_key, 11) from public.api_keys a, k where a.id = k.id),
  'stored hash matches the shown key');
select pg_temp.expect(
  (select count(*) from public.audit_log where table_name = 'api_keys' and new_data->>'key_hash' = '[redacted]') >= 1,
  'audit log redacts key hash');

-- Revoke
select pg_temp.login('sales');
select pg_temp.expect(pg_temp.fails($q$select public.rr_api_key_revoke((select id from k))$q$), 'sales cannot revoke');
select pg_temp.expect((select count(*) from public.api_keys) = 0, 'sales sees no keys');
select pg_temp.login('admin');
select public.rr_api_key_revoke((select id from k));
select pg_temp.expect((select revoked_at is not null from public.api_keys where id = (select id from k)), 'admin revokes');

-- Webhooks
select pg_temp.expect(pg_temp.fails($q$select * from public.rr_webhook_endpoint_create('http://insecure.example.com/hook')$q$), 'http (not https) refused');
create temp table w on commit drop as select * from public.rr_webhook_endpoint_create('https://hooks.example.com/rr', array['mark_paid']);
create temp table w2 on commit drop as select * from public.rr_webhook_endpoint_create('https://hooks.example.com/all');
select pg_temp.expect((select signing_secret ~ '^whsec_[0-9a-f]{64}$' from w), 'signing secret shown once');
select pg_temp.expect(pg_temp.fails('select secret from public.webhook_endpoints'), 'admin cannot read stored secret');
select pg_temp.expect(not pg_temp.fails($q$update public.webhook_endpoints set description = 'Billing' where id = (select id from w)$q$), 'admin edits endpoint');
select pg_temp.expect(pg_temp.fails($q$update public.webhook_endpoints set secret = 'x' where id = (select id from w)$q$), 'nobody overwrites secret from the app');
reset role;
select pg_temp.expect(
  (select count(*) from public.audit_log where table_name = 'webhook_endpoints' and new_data ? 'secret' and new_data->>'secret' <> '[redacted]') = 0,
  'audit log never holds a webhook secret');

-- Fan out from event_outbox: filtered + wildcard, tenant scoped
insert into public.event_outbox (id, event_type, aggregate_type, aggregate_id, payload)
values ('d0000000-0000-4000-8000-000000000001', 'mark_paid', 'invoice', 'RR-1', '{"amount": 10}'),
       ('d0000000-0000-4000-8000-000000000002', 'create_crm', 'crm', 'c1', '{}');
insert into public.event_outbox (id, tenant_id, event_type) values ('d0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'mark_paid');
select pg_temp.expect((select count(*) from public.webhook_deliveries where endpoint_id = (select id from w)) = 1, 'filtered endpoint gets only mark_paid');
select pg_temp.expect((select count(*) from public.webhook_deliveries where endpoint_id = (select id from w2)) = 2, 'wildcard endpoint gets both events');
select pg_temp.expect((select count(*) from public.webhook_deliveries where event_id = 'd0000000-0000-4000-8000-000000000003') = 0, 'tenant B event not sent to tenant A endpoints');
select pg_temp.expect((select payload->'data'->>'amount' = '10' and payload->>'type' = 'mark_paid' from public.webhook_deliveries where endpoint_id = (select id from w)), 'delivery payload shape');

-- Role access to deliveries + endpoints
select pg_temp.login('manager');
select pg_temp.expect((select count(*) from public.webhook_deliveries) = 0, 'manager sees no deliveries');
select pg_temp.expect((select count(*) from public.webhook_endpoints) = 0, 'manager sees no endpoints');
select pg_temp.expect(pg_temp.fails($q$select * from public.rr_webhook_endpoint_create('https://x.example.com')$q$), 'manager cannot add a webhook');
select pg_temp.login('viewer');
select pg_temp.expect((select count(*) from public.webhook_endpoints) = 0, 'viewer sees no endpoints');
select pg_temp.login('staff');
select pg_temp.expect((select count(*) from public.webhook_deliveries) = 0, 'staff sees no deliveries');
select pg_temp.login('admin');
select pg_temp.expect((select count(*) from public.webhook_deliveries) = 3, 'admin sees delivery log');
select pg_temp.login('b_admin');
select pg_temp.expect((select count(*) from public.webhook_endpoints) = 0, 'tenant B admin sees no tenant A endpoints');
select pg_temp.expect((select count(*) from public.api_keys) = 0, 'tenant B admin sees no tenant A keys');
select pg_temp.expect(pg_temp.fails($q$select public.rr_api_key_revoke((select id from k))$q$), 'tenant B admin cannot revoke tenant A key');
reset role;
set local role anon;
select pg_temp.expect(pg_temp.fails('select 1 from public.api_keys'), 'anon cannot read keys');
select pg_temp.expect(pg_temp.fails('select 1 from public.webhook_endpoints'), 'anon cannot read endpoints');
reset role;

-- Worker functions: service role only; claim, backoff, dead letter
select pg_temp.login('admin');
select pg_temp.expect(pg_temp.fails('select * from public.rr_claim_webhook_deliveries(10)'), 'app users cannot claim deliveries (secrets)');
reset role;
create temp table c on commit drop as select * from public.rr_claim_webhook_deliveries(10);
select pg_temp.expect((select count(*) from c) = 3 and (select bool_and(secret like 'whsec_%') from c), 'worker claims due deliveries with secret');
select pg_temp.expect((select count(*) from public.rr_claim_webhook_deliveries(10)) = 0, 'claimed rows are not claimed twice');
select pg_temp.expect(public.rr_webhook_delivery_result((select id from c limit 1), true, 200, '') = 'succeeded', 'success recorded');
select pg_temp.expect(public.rr_webhook_delivery_result((select id from c limit 1), false, 500, 'x') = 'not_sending', 'finished delivery cannot be re-recorded');
select pg_temp.expect(public.rr_webhook_delivery_result((select id from c offset 1 limit 1), false, 500, 'boom') = 'failed', 'failure recorded');
select pg_temp.expect(
  (select next_attempt_at > now() + interval '50 seconds' and attempts = 1 from public.webhook_deliveries where id = (select id from c offset 1 limit 1)),
  'first retry waits about a minute');
update public.webhook_deliveries set status = 'sending', attempts = 7 where id = (select id from c offset 2 limit 1);
select pg_temp.expect(public.rr_webhook_delivery_result((select id from c offset 2 limit 1), false, 500, 'boom') = 'dead', 'eighth failure goes to dead letter');

rollback;
