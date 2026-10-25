-- PR J: lead intake. Website forms, WhatsApp click to chat links and the AI
-- CRM landing page post to the lead-intake Edge Function, which keeps every
-- lead here with its source and UTM values and links it to the account, CRM
-- row or deal it created or matched. Safe to run more than once.

alter table public.website_inquiries add column if not exists company text not null default '';
alter table public.website_inquiries add column if not exists channel text not null default 'website_form';
alter table public.website_inquiries add column if not exists pipeline text not null default 'crm';
alter table public.website_inquiries add column if not exists source text not null default '';
alter table public.website_inquiries add column if not exists utm_source text not null default '';
alter table public.website_inquiries add column if not exists utm_medium text not null default '';
alter table public.website_inquiries add column if not exists utm_campaign text not null default '';
alter table public.website_inquiries add column if not exists utm_term text not null default '';
alter table public.website_inquiries add column if not exists utm_content text not null default '';
alter table public.website_inquiries add column if not exists page_url text not null default '';
alter table public.website_inquiries add column if not exists account_id uuid references public.accounts(id) on delete set null;
alter table public.website_inquiries add column if not exists deal_id text not null default '';
alter table public.website_inquiries add column if not exists owner_user_id uuid references public.app_users(id) on delete set null;
alter table public.website_inquiries add column if not exists matched boolean not null default false;
-- A one way hash of the sender's address, only for the per sender limit.
alter table public.website_inquiries add column if not exists ip_hash text not null default '';

create index if not exists website_inquiries_created_idx on public.website_inquiries (created_at desc);
create index if not exists website_inquiries_ip_hash_idx on public.website_inquiries (ip_hash, created_at) where ip_hash <> '';

-- The old direct insert from the website form still works, but only the
-- function (service key) may link a lead to an account or deal, or mark it
-- as matched. UTM values from the page are fine, within limits.
drop policy if exists "Public submit inquiry" on public.website_inquiries;
create policy "Public submit inquiry" on public.website_inquiries
  for insert to anon, authenticated
  with check (
    status = 'new'
    and crm_id = ''
    and char_length(name) between 1 and 200
    and char_length(email) between 3 and 320
    and email like '%_@_%'
    and char_length(phone) <= 50
    and char_length(vertical) <= 100
    and char_length(message) <= 5000
    and char_length(company) <= 200
    and channel = 'website_form'
    and pipeline = 'crm'
    and char_length(source) <= 200
    and char_length(utm_source) <= 200
    and char_length(utm_medium) <= 200
    and char_length(utm_campaign) <= 200
    and char_length(utm_term) <= 200
    and char_length(utm_content) <= 200
    and char_length(page_url) <= 500
    and account_id is null
    and deal_id = ''
    and owner_user_id is null
    and matched = false
    and ip_hash = ''
  );
