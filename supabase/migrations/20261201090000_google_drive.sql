-- Google Drive replaces Zoho WorkDrive for customer and company files.
--
-- drive_connection: the one Google Drive an admin connects in Settings
-- (refresh token + the RR Central folders). Only Edge Functions (service
-- key) read or write it; no role in the app can, not even admins.
--
-- portal_uploads: neutral names (filed, drive_file_id, drive_url) instead of
-- the WorkDrive ones. Old WorkDrive links on existing rows stay as they are.
--
-- Safe to run more than once.

create table if not exists public.drive_connection (
  id smallint primary key default 1 check (id = 1),
  refresh_token text not null default '',
  account_email text not null default '',
  root_folder_id text not null default '',
  customers_folder_id text not null default '',
  company_folder_id text not null default '',
  connected_by text not null default '',
  connected_at timestamptz not null default now()
);

alter table public.drive_connection enable row level security;
revoke all on public.drive_connection from anon, authenticated;
-- Never the blanket policies earlier migrations add on re-run.
drop policy if exists "Staff full access" on public.drive_connection;
drop policy if exists "Viewers read" on public.drive_connection;
-- No policies: the refresh token is a key to the company Drive.

------------------------------------------------------------ portal_uploads
-- Skipped where the Wave 4 client portal SQL has not been run yet; that
-- section now creates the table with these names.
do $$
begin
  if to_regclass('public.portal_uploads') is null then
    return;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'portal_uploads' and column_name = 'workdrive_id') then
    alter table public.portal_uploads rename column workdrive_id to drive_file_id;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'portal_uploads' and column_name = 'workdrive_url') then
    alter table public.portal_uploads rename column workdrive_url to drive_url;
  end if;
  alter table public.portal_uploads drop constraint if exists portal_uploads_status_check;
  update public.portal_uploads set status = 'filed' where status = 'in_workdrive';
  alter table public.portal_uploads add constraint portal_uploads_status_check
    check (status in ('received', 'filed'));
end $$;

------------------------------------------------------------ file links
-- New links are Google Drive links. Rows already saved keep their provider.
do $$
begin
  if to_regclass('public.customer_documents') is not null then
    alter table public.customer_documents alter column storage_provider set default 'google_drive';
  end if;
  if to_regclass('public.company_documents') is not null then
    alter table public.company_documents alter column storage_provider set default 'google_drive';
  end if;
end $$;

------------------------------------------------------------ settings
-- WorkDrive settings are gone. The company folder link is set when Google
-- Drive is connected (companyDriveFolderUrl).
delete from public.app_settings
where key in (
  'zohoWorkDriveEnabled', 'zohoWorkDriveApiDomain', 'zohoWorkDriveRootFolderId',
  'customerWorkDriveRootUrl', 'companyWorkDriveRootUrl', 'customerDriveRootUrl'
);
update public.app_settings
set value = 'Each customer gets a folder in Google Drive under RR Central / Customers. Upload signed copies and slips there, then paste the share link into Customer files.'
where key = 'customerDriveHint' and value ilike '%workdrive%';
update public.app_settings
set value = 'Upload trade license, VAT certificate, and other company papers to Google Drive (RR Central / Company documents), then paste the share link here.'
where key ilike 'company%hint%' and value ilike '%workdrive%';

notify pgrst, 'reload schema';
