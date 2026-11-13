-- Ask RR: read-only Claude Q&A over the Threads CRM snapshot.
-- Cost is logged without an account_id (not client profitability).

begin;

alter table public.ai_usage_log
  alter column account_id drop not null;

alter table public.ai_usage_log drop constraint if exists ai_usage_log_feature_check;
alter table public.ai_usage_log
  add constraint ai_usage_log_feature_check
  check (feature in (
    'ticket_summary',
    'ticket_reply',
    'report_summary',
    'call_notes',
    'call_brief',
    'update_tidy',
    'crm_ask'
  ));

-- Keep existing visible-account reads; also let staff see CRM Ask rows (no account).
drop policy if exists "Read AI use on visible accounts" on public.ai_usage_log;
create policy "Read AI use on visible accounts" on public.ai_usage_log
  for select to authenticated
  using (
    (account_id is not null and public.rr_can_read_account(account_id))
    or (account_id is null and feature = 'crm_ask')
  );

notify pgrst, 'reload schema';

commit;
