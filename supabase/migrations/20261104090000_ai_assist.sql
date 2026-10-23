begin;

-- RR Central roadmap item 7: AI inside RR Central.
--
-- ai_usage_log: one row per AI request made from RR Central (ticket summary,
-- reply draft, report summary, requirements from call notes), with the
-- tokens and cost in USD, logged against the account so it counts in that
-- client's profitability. Only the ai-assist Edge Function writes rows (with
-- the service role, after checking the person may edit the account); the
-- team reads them on accounts it can see.
--
-- Changes no existing data. Safe to re-run.
--
-- To reverse:
--   drop table if exists public.ai_usage_log;

create table if not exists public.ai_usage_log (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  feature text not null check (feature in ('ticket_summary', 'ticket_reply', 'report_summary', 'call_notes')),
  model text not null default '',
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_usd numeric(12, 6) not null default 0 check (cost_usd >= 0),
  created_by text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_log_account_idx on public.ai_usage_log (account_id, created_at);

alter table public.ai_usage_log enable row level security;
revoke all on public.ai_usage_log from anon;
revoke insert, update, delete on public.ai_usage_log from authenticated;
grant select on public.ai_usage_log to authenticated;
-- Never the blanket policies earlier migrations add on re-run.
drop policy if exists "Staff full access" on public.ai_usage_log;
drop policy if exists "Viewers read" on public.ai_usage_log;

drop policy if exists "Read AI use on visible accounts" on public.ai_usage_log;
create policy "Read AI use on visible accounts" on public.ai_usage_log
  for select to authenticated using (public.rr_can_read_account(account_id));

notify pgrst, 'reload schema';

commit;
