-- PR L: follow up templates and the "quote sent, no reply in 3 days" nudge.
--
-- message_templates: WhatsApp and email wording with merge fields, per
-- division. Managers and admins edit them; the sales team uses them.
-- quotations.sent_at: when the quote went out (set by a trigger whenever the
-- status becomes Sent). quotations.followed_up_at: the last follow up sent
-- from the nudge. Safe to run more than once.

create table if not exists public.message_templates (
  id uuid primary key default uuid_generate_v4(),
  name text not null check (char_length(name) between 1 and 120),
  division_code text not null default '' check (division_code ~ '^([0-9]{2})?$'),
  channel text not null check (channel in ('whatsapp', 'email')),
  purpose text not null default 'quote_followup' check (purpose in ('quote_followup', 'general')),
  subject text not null default '' check (char_length(subject) <= 300),
  body text not null check (char_length(body) between 1 and 4000),
  active boolean not null default true,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists message_templates_pick_idx on public.message_templates (purpose, channel, division_code);

alter table public.message_templates enable row level security;
revoke all on public.message_templates from anon;
grant select, insert, update, delete on public.message_templates to authenticated;
drop policy if exists "Staff full access" on public.message_templates;
drop policy if exists "Viewers read" on public.message_templates;
drop policy if exists "Sales team read templates" on public.message_templates;
drop policy if exists "Managers edit templates" on public.message_templates;
create policy "Sales team read templates" on public.message_templates
  for select to authenticated using (public.rr_is_staff());
create policy "Managers edit templates" on public.message_templates
  for all to authenticated
  using (public.rr_is_manager_or_admin())
  with check (public.rr_is_manager_or_admin());

alter table public.quotations add column if not exists sent_at timestamptz;
alter table public.quotations add column if not exists followed_up_at timestamptz;

-- When the quote went out, whichever screen marks it Sent.
create or replace function public.rr_quote_sent_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'Sent' and (tg_op = 'INSERT' or old.status is distinct from 'Sent') then
    new.sent_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists rr_quote_sent_at on public.quotations;
create trigger rr_quote_sent_at
  before insert or update of status on public.quotations
  for each row execute function public.rr_quote_sent_at();

-- Quotes already Sent: their last change is the best guess for when.
update public.quotations set sent_at = updated_at where status = 'Sent' and sent_at is null;

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rr_audit_trigger'
  ) then
    drop trigger if exists rr_audit on public.message_templates;
    create trigger rr_audit after insert or update or delete on public.message_templates
      for each row execute function public.rr_audit_trigger();
  end if;
end $$;

notify pgrst, 'reload schema';
