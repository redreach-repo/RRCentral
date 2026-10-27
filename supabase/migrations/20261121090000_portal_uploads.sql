-- Wave 4, PR P: files a client uploads from the client portal. The
-- client-portal Edge Function (service key) writes the row and puts the file
-- in the client's Google Drive folder. While Google Drive is not connected, or
-- the client is not in the CRM, the file waits here (content_base64, 5 MB at
-- most) so the team can download it; the content is cleared once it is filed.
-- Clients never read tables. Safe to run more than once.

create table if not exists public.portal_uploads (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  portal_access_id uuid references public.portal_access(id) on delete set null,
  filename text not null check (char_length(filename) between 1 and 120),
  content_type text not null default '',
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  note text not null default '' check (char_length(note) <= 1000),
  -- received: waiting here. filed: saved in the client's Google Drive folder.
  status text not null default 'received' check (status in ('received', 'filed')),
  drive_file_id text not null default '',
  drive_url text not null default '',
  error text not null default '',
  content_base64 text not null default '' check (char_length(content_base64) <= 7000000),
  created_at timestamptz not null default now()
);
create index if not exists portal_uploads_account_idx on public.portal_uploads (account_id, created_at desc);

alter table public.portal_uploads enable row level security;
revoke all on public.portal_uploads from anon;
grant select, update, delete on public.portal_uploads to authenticated;
revoke insert on public.portal_uploads from authenticated;
-- Never the blanket policies earlier migrations add on re-run.
drop policy if exists "Staff full access" on public.portal_uploads;
drop policy if exists "Viewers read" on public.portal_uploads;

drop policy if exists "Read uploads on visible accounts" on public.portal_uploads;
create policy "Read uploads on visible accounts" on public.portal_uploads
  for select to authenticated using (public.rr_can_read_account(account_id));

-- The team notes that a waiting file was filed by hand (and clears its content).
drop policy if exists "File uploads on editable accounts" on public.portal_uploads;
create policy "File uploads on editable accounts" on public.portal_uploads
  for update to authenticated
  using (public.rr_can_write_account(account_id))
  with check (public.rr_can_write_account(account_id));

drop policy if exists "Admins delete uploads" on public.portal_uploads;
create policy "Admins delete uploads" on public.portal_uploads
  for delete to authenticated using (public.rr_is_admin());

-- No audit trigger: it would copy the file content into the audit log.
-- No insert policy: only the client-portal function adds uploads.

notify pgrst, 'reload schema';
