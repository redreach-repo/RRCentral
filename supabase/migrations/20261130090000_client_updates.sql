-- Wave 5, PR Z: the weekly CTRM Next client update. Every Thursday the
-- client-updates Edge Function (service key) adds one draft per CTRM Next
-- client with a signed deal: issues fixed this week, issues still open and
-- the next session or milestone. A person checks the wording here and sends
-- it by email or WhatsApp with one tap; only the function marks it sent and
-- logs it on the timeline. Relationship facts only: never trades, positions
-- or prices. Safe to run more than once.

create table if not exists public.client_update_drafts (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  -- The Monday of the week the update covers.
  week_start date not null check (extract(isodow from week_start) = 1),
  status text not null default 'draft' check (status in ('draft', 'sent', 'skipped')),
  body text not null default '' check (char_length(body) <= 4000),
  -- What the draft was built from, as short lines, so the wording can be checked against it.
  facts jsonb not null default '[]'::jsonb,
  error text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_by text not null default '',
  sent_at timestamptz,
  sent_via text not null default '' check (sent_via in ('', 'email', 'whatsapp')),
  sent_to text not null default '',
  unique (account_id, week_start)
);
create index if not exists client_update_drafts_week_idx on public.client_update_drafts (week_start desc, status);

alter table public.client_update_drafts enable row level security;
revoke all on public.client_update_drafts from anon;
grant select, update, delete on public.client_update_drafts to authenticated;
revoke insert on public.client_update_drafts from authenticated;
-- Never the blanket policies earlier migrations add on re-run.
drop policy if exists "Staff full access" on public.client_update_drafts;
drop policy if exists "Viewers read" on public.client_update_drafts;

drop policy if exists "Read update drafts on visible accounts" on public.client_update_drafts;
create policy "Read update drafts on visible accounts" on public.client_update_drafts
  for select to authenticated using (public.rr_can_read_account(account_id));

-- Edit the wording or skip a week. Sending is the function's job: nobody can
-- mark a draft sent from the app.
drop policy if exists "Edit update drafts on editable accounts" on public.client_update_drafts;
create policy "Edit update drafts on editable accounts" on public.client_update_drafts
  for update to authenticated
  using (public.rr_can_write_account(account_id) and status <> 'sent')
  with check (public.rr_can_write_account(account_id) and status in ('draft', 'skipped'));

drop policy if exists "Admins delete update drafts" on public.client_update_drafts;
create policy "Admins delete update drafts" on public.client_update_drafts
  for delete to authenticated using (public.rr_is_admin());

-- The sent columns and the facts are only ever written by the function.
create or replace function public.rr_client_update_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated' then
    if new.sent_by is distinct from old.sent_by or new.sent_at is distinct from old.sent_at
       or new.sent_via is distinct from old.sent_via or new.sent_to is distinct from old.sent_to
       or new.facts is distinct from old.facts or new.account_id is distinct from old.account_id
       or new.week_start is distinct from old.week_start or new.created_by is distinct from old.created_by then
      raise exception 'Only the update sender changes these fields';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists rr_client_update_guard on public.client_update_drafts;
create trigger rr_client_update_guard before update on public.client_update_drafts
  for each row execute function public.rr_client_update_guard();

-- AI help may tidy the wording of an update (it is logged like the others).
alter table public.ai_usage_log drop constraint if exists ai_usage_log_feature_check;
alter table public.ai_usage_log
  add constraint ai_usage_log_feature_check
  check (feature in ('ticket_summary', 'ticket_reply', 'report_summary', 'call_notes', 'call_brief', 'update_tidy'));

-- Audit trail.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rr_audit_trigger'
  ) then
    drop trigger if exists rr_audit on public.client_update_drafts;
    create trigger rr_audit after insert or update or delete on public.client_update_drafts
      for each row execute function public.rr_audit_trigger();
  end if;
end $$;

notify pgrst, 'reload schema';
