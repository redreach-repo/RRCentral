-- AI approval queue: proposals are only suggestions; approve runs as the
-- approver under their own RLS; reject/cancel rules; decisions are final;
-- direct updates and forged "executed" marks are refused; tenant isolation.
begin;
\ir _fixtures.sql

insert into public.accounts (id, type, name, owner_user_id, tenant_id) values
  ('ac000000-0000-4000-8000-000000000001', 'rr_marketing_client', 'AIQ Client A', null, 'a0000000-0000-4000-8000-000000000001'),
  ('ac000000-0000-4000-8000-000000000002', 'rr_marketing_client', 'AIQ Staff Owned',
     (select id from public.app_users where email = 'mt-staff@redreach.ae'), 'a0000000-0000-4000-8000-000000000001'),
  ('ac000000-0000-4000-8000-0000000000b1', 'rr_marketing_client', 'AIQ Tenant B', null, 'b0000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

-- ---------------------------------------------------------------- proposing
select pg_temp.login('sales');
insert into public.ai_action_proposals (id, account_id, action, payload, prompt, status, decided_at)
values ('a1000000-0000-4000-8000-000000000001', 'ac000000-0000-4000-8000-000000000001', 'add_timeline_note',
        '{"kind":"note","body":"Client asked for a Q3 review"}', 'log the call', 'executed', now());
select pg_temp.expect((select status = 'pending' and decided_at is null from public.ai_action_proposals where id = 'a1000000-0000-4000-8000-000000000001'),
  'insert is forced to pending, decision fields cleared');
select pg_temp.expect((select proposed_by_email = 'mt-sales@redreach.ae' from public.ai_action_proposals where id = 'a1000000-0000-4000-8000-000000000001'),
  'proposer stamped from the session');
select pg_temp.expect(not exists (select 1 from public.account_activities where account_id = 'ac000000-0000-4000-8000-000000000001'),
  'a proposal writes nothing to the CRM');

select pg_temp.expect(pg_temp.fails($q$insert into public.ai_action_proposals (account_id, action, payload) values ('ac000000-0000-4000-8000-000000000001', 'delete_account', '{}')$q$),
  'unknown action refused');
select pg_temp.expect(pg_temp.fails($q$insert into public.ai_action_proposals (account_id, action, payload) values ('ac000000-0000-4000-8000-000000000001', 'update_account_fields', '{"owner_user_id":"x"}')$q$),
  'field outside the allow list refused');
select pg_temp.expect(pg_temp.fails($q$insert into public.ai_action_proposals (account_id, action, payload) values ('ac000000-0000-4000-8000-000000000001', 'add_timeline_note', '{"kind":"system","body":"x"}')$q$),
  'timeline kind system refused');
select pg_temp.expect(pg_temp.fails($q$insert into public.ai_action_proposals (account_id, action, payload) values ('ac000000-0000-4000-8000-0000000000b1', 'add_timeline_note', '{"kind":"note","body":"x"}')$q$),
  'cannot propose on another tenant''s account');

-- direct update is not possible for anyone signed in
select pg_temp.expect(pg_temp.fails($q$update public.ai_action_proposals set status = 'executed' where id = 'a1000000-0000-4000-8000-000000000001'$q$),
  'direct update refused');

-- forging "executed" without the data is refused
select pg_temp.expect(pg_temp.fails($q$select public.rr_ai_proposal_record('a1000000-0000-4000-8000-000000000001', 'executed')$q$),
  'cannot mark executed when the timeline row is not there');

-- viewer and staff (not owner) cannot see or propose on account A
select pg_temp.login('viewer');
select pg_temp.expect((select count(*) = 0 from public.ai_action_proposals), 'viewer sees no proposals');
select pg_temp.expect(pg_temp.fails($q$insert into public.ai_action_proposals (account_id, action, payload) values ('ac000000-0000-4000-8000-000000000001', 'add_timeline_note', '{"kind":"note","body":"x"}')$q$),
  'viewer cannot propose');
select pg_temp.expect(pg_temp.fails($q$select public.rr_ai_proposal_decide('a1000000-0000-4000-8000-000000000001', 'approve')$q$),
  'viewer cannot approve');
select pg_temp.login('staff');
select pg_temp.expect((select count(*) = 0 from public.ai_action_proposals where account_id = 'ac000000-0000-4000-8000-000000000001'),
  'staff does not see proposals on accounts they do not own');
select pg_temp.expect(pg_temp.fails($q$select public.rr_ai_proposal_decide('a1000000-0000-4000-8000-000000000001', 'approve')$q$),
  'staff cannot approve on an account they cannot edit');
select pg_temp.expect(pg_temp.fails($q$select public.rr_ai_proposal_record('a1000000-0000-4000-8000-000000000001', 'rejected')$q$),
  'staff cannot reject on an account they cannot edit');
select pg_temp.login('b_admin');
select pg_temp.expect((select count(*) = 0 from public.ai_action_proposals), 'tenant B admin sees none of tenant A');
select pg_temp.expect(pg_temp.fails($q$select public.rr_ai_proposal_record('a1000000-0000-4000-8000-000000000001', 'rejected')$q$),
  'tenant B admin cannot decide on tenant A');

-- ---------------------------------------------------------------- approving
select pg_temp.login('manager');
select pg_temp.expect((select (public.rr_ai_proposal_decide('a1000000-0000-4000-8000-000000000001', 'approve',
  '{"kind":"call","body":"Client asked for a Q3 review on 3 Dec"}', 'edited date')).status = 'executed'),
  'manager approves an edited proposal');
select pg_temp.expect((select user_email = 'mt-manager@redreach.ae' and kind = 'call' and body like '%3 Dec'
  from public.account_activities where external_source = 'ai_proposal' and external_id = 'a1000000-0000-4000-8000-000000000001'),
  'timeline row written as the approver with the edited text');
select pg_temp.expect((select original_payload->>'kind' = 'note' and payload->>'kind' = 'call' and decided_by_email = 'mt-manager@redreach.ae'
  from public.ai_action_proposals where id = 'a1000000-0000-4000-8000-000000000001'),
  'original and edited payloads both kept');
select pg_temp.expect(pg_temp.fails($q$select public.rr_ai_proposal_decide('a1000000-0000-4000-8000-000000000001', 'reject')$q$),
  'a decided proposal is final');
select pg_temp.expect(pg_temp.fails($q$select public.rr_ai_proposal_decide('a1000000-0000-4000-8000-000000000001', 'approve')$q$),
  'cannot run the same proposal twice');

-- edit with a field outside the allow list is refused at approve time
insert into public.ai_action_proposals (id, account_id, action, payload)
values ('a1000000-0000-4000-8000-000000000002', 'ac000000-0000-4000-8000-000000000001', 'update_account_fields',
        '{"industry":"Logistics","city":"Dubai"}');
select pg_temp.expect(pg_temp.fails($q$select public.rr_ai_proposal_decide('a1000000-0000-4000-8000-000000000002', 'approve', '{"name":"Hacked"}')$q$),
  'edited payload outside the allow list refused');
select pg_temp.expect((select (public.rr_ai_proposal_decide('a1000000-0000-4000-8000-000000000002', 'approve')).status = 'executed'),
  'account field update approved');
select pg_temp.expect((select industry = 'Logistics' and city = 'Dubai' and name = 'AIQ Client A' from public.accounts where id = 'ac000000-0000-4000-8000-000000000001'),
  'only the approved fields changed');

-- staff can approve on the account they own (their own RLS allows it)
select pg_temp.login('staff');
insert into public.ai_action_proposals (id, account_id, action, payload)
values ('a1000000-0000-4000-8000-000000000003', 'ac000000-0000-4000-8000-000000000002', 'add_timeline_note', '{"kind":"note","body":"Owner note"}');
select pg_temp.expect((select (public.rr_ai_proposal_decide('a1000000-0000-4000-8000-000000000003', 'approve')).status = 'executed'),
  'staff approves on an account they own');

-- ------------------------------------------------- reject, cancel, settings
select pg_temp.login('sales');
insert into public.ai_action_proposals (id, account_id, action, payload)
values ('a1000000-0000-4000-8000-000000000004', 'ac000000-0000-4000-8000-000000000001', 'add_timeline_note', '{"kind":"note","body":"Reject me"}'),
       ('a1000000-0000-4000-8000-000000000005', 'ac000000-0000-4000-8000-000000000001', 'add_timeline_note', '{"kind":"note","body":"Cancel me"}'),
       ('a1000000-0000-4000-8000-000000000006', 'ac000000-0000-4000-8000-000000000001', 'add_timeline_note', '{"kind":"note","body":"Needs a manager"}');
select pg_temp.login('manager');
select pg_temp.expect(pg_temp.fails($q$select public.rr_ai_proposal_decide('a1000000-0000-4000-8000-000000000005', 'cancel')$q$),
  'only the proposer can cancel');
select pg_temp.expect((select (public.rr_ai_proposal_decide('a1000000-0000-4000-8000-000000000004', 'reject', null, 'wrong client')).status = 'rejected'),
  'manager rejects');
select pg_temp.expect(not exists (select 1 from public.account_activities where body = 'Reject me'), 'rejected proposal wrote nothing');
select pg_temp.login('sales');
select pg_temp.expect((select (public.rr_ai_proposal_decide('a1000000-0000-4000-8000-000000000005', 'cancel')).status = 'cancelled'),
  'proposer cancels');

reset role;
set local request.jwt.claim.sub = '';
insert into public.app_settings (key, value) values ('ai.approvals.require_manager', 'true')
on conflict (key) do update set value = excluded.value;
select pg_temp.login('sales');
select pg_temp.expect(pg_temp.fails($q$select public.rr_ai_proposal_decide('a1000000-0000-4000-8000-000000000006', 'approve')$q$),
  'require_manager on: sales cannot approve');
select pg_temp.expect(not exists (select 1 from public.account_activities where body = 'Needs a manager'), 'refused approval wrote nothing');
select pg_temp.login('admin');
select pg_temp.expect((select (public.rr_ai_proposal_decide('a1000000-0000-4000-8000-000000000006', 'approve')).status = 'executed'),
  'require_manager on: admin approves');

-- ------------------------------------------------------------- audit + delete
reset role;
set local request.jwt.claim.sub = '';
select pg_temp.expect((select count(*) >= 6 from public.audit_log where table_name = 'ai_action_proposals'),
  'proposals and decisions are in the audit log');
select pg_temp.login('manager');
delete from public.ai_action_proposals where id = 'a1000000-0000-4000-8000-000000000004';
select pg_temp.expect(exists (select 1 from public.ai_action_proposals where id = 'a1000000-0000-4000-8000-000000000004'),
  'manager cannot delete proposals');
select pg_temp.login('admin');
delete from public.ai_action_proposals where id = 'a1000000-0000-4000-8000-000000000004';
select pg_temp.expect(not exists (select 1 from public.ai_action_proposals where id = 'a1000000-0000-4000-8000-000000000004'),
  'admin can delete a proposal');

reset role;
rollback;
