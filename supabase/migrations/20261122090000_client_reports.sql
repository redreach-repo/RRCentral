-- Wave 4, PR Q: the monthly client report Approve queue. On the 1st the
-- client-reports Edge Function (service key) adds one draft per AI CRM client
-- for the month just ended, with an AI drafted summary. A person checks and
-- edits the summary here; only the function sends it, after someone presses
-- Send. Safe to run more than once.

create table if not exists public.client_report_drafts (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  -- First day of the month the report covers.
  month date not null check (extract(day from month) = 1),
  status text not null default 'draft' check (status in ('draft', 'sent', 'skipped')),
  summary text not null default '' check (char_length(summary) <= 3000),
  -- The report numbers as short lines, exactly as they go in the message.
  facts jsonb not null default '[]'::jsonb,
  ai_cost_usd numeric(10, 4) not null default 0,
  -- Why the AI draft or a send did not work, for the queue to show.
  error text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_by text not null default '',
  sent_at timestamptz,
  sent_email_to text not null default '',
  sent_whatsapp_to text not null default '',
  unique (account_id, month)
);
create index if not exists client_report_drafts_month_idx on public.client_report_drafts (month desc, status);

alter table public.client_report_drafts enable row level security;
revoke all on public.client_report_drafts from anon;
grant select, update, delete on public.client_report_drafts to authenticated;
revoke insert on public.client_report_drafts from authenticated;
-- Never the blanket policies earlier migrations add on re-run.
drop policy if exists "Staff full access" on public.client_report_drafts;
drop policy if exists "Viewers read" on public.client_report_drafts;

drop policy if exists "Read report drafts on visible accounts" on public.client_report_drafts;
create policy "Read report drafts on visible accounts" on public.client_report_drafts
  for select to authenticated using (public.rr_can_read_account(account_id));

-- Edit the summary or skip a draft. Sending is the function's job: nobody can
-- mark a draft sent from the app.
drop policy if exists "Edit report drafts on editable accounts" on public.client_report_drafts;
create policy "Edit report drafts on editable accounts" on public.client_report_drafts
  for update to authenticated
  using (public.rr_can_write_account(account_id) and status <> 'sent')
  with check (public.rr_can_write_account(account_id) and status in ('draft', 'skipped'));

drop policy if exists "Admins delete report drafts" on public.client_report_drafts;
create policy "Admins delete report drafts" on public.client_report_drafts
  for delete to authenticated using (public.rr_is_admin());

-- The sent columns are only ever written by the function.
create or replace function public.rr_client_report_guard()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'authenticated' then
    if new.sent_by is distinct from old.sent_by or new.sent_at is distinct from old.sent_at
       or new.sent_email_to is distinct from old.sent_email_to or new.sent_whatsapp_to is distinct from old.sent_whatsapp_to
       or new.facts is distinct from old.facts or new.ai_cost_usd is distinct from old.ai_cost_usd
       or new.account_id is distinct from old.account_id or new.month is distinct from old.month then
      raise exception 'Only the report sender changes these fields';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists rr_client_report_guard on public.client_report_drafts;
create trigger rr_client_report_guard before update on public.client_report_drafts
  for each row execute function public.rr_client_report_guard();

-- Audit trail.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rr_audit_trigger'
  ) then
    drop trigger if exists rr_audit on public.client_report_drafts;
    create trigger rr_audit after insert or update or delete on public.client_report_drafts
      for each row execute function public.rr_audit_trigger();
  end if;
end $$;

notify pgrst, 'reload schema';
