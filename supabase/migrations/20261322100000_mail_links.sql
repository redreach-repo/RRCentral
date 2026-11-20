-- Mail step 2: link an email to a client (account), CRM company or deal,
-- quotation or invoice, so it shows in that record's email history (docs/mail.md).
--
-- Only the email's header is kept here (subject, from, to, date). The body stays
-- in the person's own Zoho mailbox, so only they can open it. Rows are written
-- by the mail-inbox Edge Function (service role), which reads the header from
-- the linker's own mailbox, so nobody can invent a link for an email they do
-- not have. Admin, manager and sales read the history, like clients and
-- quotations. Whoever linked an email can unlink it; managers and admins too.
-- Safe to run more than once.

create table if not exists public.mail_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default 'a0000000-0000-4000-8000-000000000001'::uuid
    references public.tenants (id) on delete cascade,
  target_type text not null check (target_type in ('account', 'crm', 'quotation', 'invoice')),
  target_id uuid not null,
  mailbox_owner text not null,
  message_id text not null check (message_id ~ '^[0-9]{1,30}$'),
  folder_id text not null default '' check (folder_id ~ '^[0-9]{0,30}$'),
  subject text not null default '',
  from_address text not null default '',
  to_address text not null default '',
  sent_at timestamptz,
  has_attachment boolean not null default false,
  linked_by text not null,
  created_at timestamptz not null default now(),
  constraint mail_links_owner_lower check (mailbox_owner = lower(mailbox_owner)),
  constraint mail_links_linker_lower check (linked_by = lower(linked_by))
);

create unique index if not exists mail_links_once
  on public.mail_links (mailbox_owner, message_id, target_type, target_id);
create index if not exists mail_links_target_idx
  on public.mail_links (target_type, target_id, sent_at desc);

alter table public.mail_links enable row level security;
revoke all on public.mail_links from anon;
revoke insert, update on public.mail_links from authenticated;
grant select, delete on public.mail_links to authenticated;

-- The blanket "Staff full access" policy may have been added by a re-run of the
-- older security migration; this table wants narrower rules.
drop policy if exists "Staff full access" on public.mail_links;
drop policy if exists "Viewers read" on public.mail_links;
drop policy if exists "Team reads email history" on public.mail_links;
drop policy if exists "Linker or manager unlinks" on public.mail_links;

create policy "Team reads email history" on public.mail_links
  for select to authenticated
  using (public.rr_is_staff());

create policy "Linker or manager unlinks" on public.mail_links
  for delete to authenticated
  using (public.rr_is_staff() and (linked_by = public.rr_current_email() or public.rr_is_manager_or_admin()));

notify pgrst, 'reload schema';
