-- PR K: quote accept link. Same pattern as the client portal: a private link
-- per quote whose random token is only kept as a SHA-256 hash, with an expiry
-- date, that can be turned off. The quote-accept Edge Function (service key)
-- looks the hash up; clients never read tables.
--
-- quote_accept_links: the links, and who accepted (name and time).
-- quote_accept_pdfs: the PDF each link shows.
-- quote_acceptances: the full record (name, date, address, time). Admins only.
-- Safe to run more than once.

create table if not exists public.quote_accept_links (
  id uuid primary key default uuid_generate_v4(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  label text not null default '',
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  pdf_name text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_opened_at timestamptz,
  accepted_at timestamptz,
  accepted_name text not null default ''
);
create index if not exists quote_accept_links_quote_idx on public.quote_accept_links (quotation_id);

-- The quote PDF as it was sent, base64: the client sees exactly this. Kept
-- apart so the audit trail and link lists never carry the file.
create table if not exists public.quote_accept_pdfs (
  link_id uuid primary key references public.quote_accept_links(id) on delete cascade,
  pdf_base64 text not null check (char_length(pdf_base64) between 1 and 8000000)
);

create table if not exists public.quote_acceptances (
  id uuid primary key default uuid_generate_v4(),
  link_id uuid not null unique references public.quote_accept_links(id) on delete cascade,
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  accepted_name text not null,
  -- The date the client signed for, and the moment they pressed Accept.
  accepted_date date not null,
  accepted_at timestamptz not null default now(),
  ip text not null default '',
  user_agent text not null default '',
  -- What the acceptance changed, so a person can check and finalise it.
  sales_deal_id uuid,
  contract_id uuid,
  crm_id text not null default ''
);
create index if not exists quote_acceptances_quote_idx on public.quote_acceptances (quotation_id);

alter table public.quote_accept_links enable row level security;
alter table public.quote_acceptances enable row level security;
alter table public.quote_accept_pdfs enable row level security;
revoke all on public.quote_accept_pdfs from anon;
grant select, insert, delete on public.quote_accept_pdfs to authenticated;
revoke all on public.quote_accept_links from anon;
revoke all on public.quote_acceptances from anon;
grant select, insert, update, delete on public.quote_accept_links to authenticated;
grant select on public.quote_acceptances to authenticated;
-- Never the blanket policies earlier migrations add on re-run.
drop policy if exists "Staff full access" on public.quote_accept_links;
drop policy if exists "Viewers read" on public.quote_accept_links;
drop policy if exists "Staff full access" on public.quote_acceptances;
drop policy if exists "Viewers read" on public.quote_acceptances;
drop policy if exists "Staff full access" on public.quote_accept_pdfs;
drop policy if exists "Viewers read" on public.quote_accept_pdfs;

-- The people who work on quotes (admin, manager, sales) make and turn off
-- links. Only the function marks a link accepted. Only admins delete.
drop policy if exists "Sales team read accept links" on public.quote_accept_links;
drop policy if exists "Sales team add accept links" on public.quote_accept_links;
drop policy if exists "Sales team turn off accept links" on public.quote_accept_links;
drop policy if exists "Admins delete accept links" on public.quote_accept_links;
create policy "Sales team read accept links" on public.quote_accept_links
  for select to authenticated using (public.rr_is_staff());
create policy "Sales team add accept links" on public.quote_accept_links
  for insert to authenticated
  with check (public.rr_is_staff() and accepted_at is null and accepted_name = '' and revoked_at is null);
create policy "Sales team turn off accept links" on public.quote_accept_links
  for update to authenticated
  using (public.rr_is_staff() and accepted_at is null)
  with check (public.rr_is_staff() and accepted_at is null and accepted_name = '');
create policy "Admins delete accept links" on public.quote_accept_links
  for delete to authenticated using (public.rr_is_admin());

drop policy if exists "Sales team read accept PDFs" on public.quote_accept_pdfs;
drop policy if exists "Sales team add accept PDFs" on public.quote_accept_pdfs;
drop policy if exists "Admins delete accept PDFs" on public.quote_accept_pdfs;
create policy "Sales team read accept PDFs" on public.quote_accept_pdfs
  for select to authenticated using (public.rr_is_staff());
create policy "Sales team add accept PDFs" on public.quote_accept_pdfs
  for insert to authenticated with check (public.rr_is_staff());
create policy "Admins delete accept PDFs" on public.quote_accept_pdfs
  for delete to authenticated using (public.rr_is_admin());

drop policy if exists "Admins read acceptances" on public.quote_acceptances;
create policy "Admins read acceptances" on public.quote_acceptances
  for select to authenticated using (public.rr_is_admin());

-- Audit trail.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rr_audit_trigger'
  ) then
    drop trigger if exists rr_audit on public.quote_accept_links;
    create trigger rr_audit after insert or update or delete on public.quote_accept_links
      for each row execute function public.rr_audit_trigger();
    drop trigger if exists rr_audit on public.quote_acceptances;
    create trigger rr_audit after insert or update or delete on public.quote_acceptances
      for each row execute function public.rr_audit_trigger();
  end if;
end $$;

notify pgrst, 'reload schema';
