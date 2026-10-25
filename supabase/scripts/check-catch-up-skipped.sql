-- RR Central: production data check for the 23 Oct 2026 catch-up.
--
-- The catch-up SQL left out six changes because they edit existing data.
-- This lists each one with what the left-out SQL would have made it
-- (expected) next to what the live database has now (actual), so you can
-- tick them off or decide to leave them.
--
-- READ ONLY: it changes nothing. Supabase -> SQL Editor -> paste -> Run.
-- status: OK = matches, DIFFERENT = decide (see what_to_do), URGENT = act now,
-- CHECK = could not tell from the database alone.
-- Steps per row: docs/PRODUCTION_DATA_CHECK.md

with
outside_logins as (
  select coalesce(string_agg(email, ', ' order by email), '') as emails, count(*) as n
  from public.app_users
  where active and email !~* '@redreach\.ae$'
),
info_app as (
  select
    (select role from public.app_users where lower(email) = 'info@redreach.ae') as role,
    (select active from public.app_users where lower(email) = 'info@redreach.ae') as active
),
info_auth as (
  select
    count(*) > 0 as has_login,
    bool_or(u.email_confirmed_at is not null) as confirmed,
    -- True when the password is still the one committed to the public repo.
    bool_or(
      coalesce(to_jsonb(u) ->> 'encrypted_password', '') <> ''
      and extensions.crypt('RedReach2026#', to_jsonb(u) ->> 'encrypted_password') = to_jsonb(u) ->> 'encrypted_password'
    ) as leaked_password,
    bool_or(coalesce(to_jsonb(u) ->> 'encrypted_password', '') <> '') as has_password
  from auth.users u
  where lower(u.email) = 'info@redreach.ae'
),
attach as (
  select
    count(*) filter (where url ilike 'data:%') as data_rows,
    count(*) filter (where url <> '' and url !~* '^https://' and url !~* '^data:') as other_rows,
    exists (select 1 from pg_constraint where conname = 'attachments_url_no_data') as c1,
    exists (select 1 from pg_constraint where conname = 'attachments_url_https_or_empty') as c2
  from public.attachments
),
address as (
  select coalesce((select value from public.app_settings where key = 'address'), '(not set)') as value
),
mass as (
  select
    (select count(*) from public.clients
       where lower(regexp_replace(company_name, '[^a-zA-Z0-9]+', ' ', 'g')) like '%mass allied freighter%') as clients,
    (select count(*) from public.clients
       where company_name = 'Mass Allied Freighters L.L.C' and trn = '100286214000003'
         and btrim(office) <> '' and btrim(address) <> '') as clients_full,
    (select count(*) from public.crm
       where lower(regexp_replace(company_name, '[^a-zA-Z0-9]+', ' ', 'g')) like '%mass allied freighter%') as crm,
    (select count(*) from public.crm
       where company_name = 'Mass Allied Freighters L.L.C' and trn = '100286214000003') as crm_full,
    (select count(*) from public.invoices
       where lower(regexp_replace(client, '[^a-zA-Z0-9]+', ' ', 'g')) like '%mass allied freighter%'
         and btrim(client) <> 'Mass Allied Freighters L.L.C') as short_invoices,
    (select count(*) from public.quotations
       where lower(regexp_replace(client, '[^a-zA-Z0-9]+', ' ', 'g')) like '%mass allied freighter%'
         and btrim(client) <> 'Mass Allied Freighters L.L.C') as short_quotes
),
quote as (
  select reference_number, offset_vat, discount_percent, discount_amount, amount
  from public.quotations
  where reference_number = 'RR-01-26003'
  limit 1
)
select * from (
  select
    1 as "#",
    'Email login only' as item,
    '0 active team logins outside @redreach.ae' as expected,
    case when o.n = 0 then '0' else o.n || ' active: ' || o.emails end as actual,
    case when o.n = 0 then 'OK' else 'DIFFERENT' end as status,
    case when o.n = 0 then 'Nothing to do.'
      else 'For each email: keep it if that person should have access, or untick Active in Settings > Users.' end as what_to_do
  from outside_logins o

  union all
  select
    2,
    'Default admin info@redreach.ae',
    'active admin, can sign in, password NOT the one in the public repo',
    concat_ws(', ',
      case when a.role is null then 'not in team list' else 'role ' || a.role || case when a.active then ', active' else ', inactive' end end,
      case when not i.has_login then 'no login' when i.confirmed then 'login confirmed' else 'login not confirmed' end,
      case when i.leaked_password then 'PASSWORD IS THE PUBLIC ONE' when i.has_password then 'own password' end),
    case
      when i.leaked_password then 'URGENT'
      when a.role = 'admin' and a.active and i.has_login and i.confirmed and i.has_password then 'OK'
      when a.role = 'admin' and a.active and i.has_login and i.confirmed then 'CHECK'
      else 'DIFFERENT'
    end,
    case
      when i.leaked_password then 'Sign in as info@redreach.ae and change the password now (Settings > My password).'
      when a.role is distinct from 'admin' or not coalesce(a.active, false) then 'Do not run the left-out SQL (it sets the public password). If info@ should be an admin, add it in Settings > Users and set a new password.'
      when not i.has_login then 'Do not run the left-out SQL. Set a login for info@ in Settings > Users with a new password.'
      else 'Nothing to do.'
    end
  from info_app a cross join info_auth i

  union all
  select
    3,
    'Attachments kept inside the database',
    '0 data: attachments, both link-only rules on',
    x.data_rows || ' data: rows, ' || x.other_rows || ' non-https links, rules '
      || case when x.c1 and x.c2 then 'on' when x.c1 or x.c2 then 'half on' else 'off' end,
    case when x.data_rows = 0 and x.other_rows = 0 and x.c1 and x.c2 then 'OK' else 'DIFFERENT' end,
    case
      when x.data_rows > 0 then 'These files live only in the database. Save any you need to WorkDrive, remove them from their records, then run the "Attachments clean-up" section on the copy page.'
      when x.other_rows > 0 then 'Some links are not https. Fix or remove them on the record, then run the "Attachments clean-up" section.'
      when not (x.c1 and x.c2) then 'Run the "Attachments clean-up" section on the copy page (nothing left to delete).'
      else 'Nothing to do.'
    end
  from attach x

  union all
  select
    4,
    'Company address on letterheads',
    'P.O. Box 7073, Umm Al Quwain, UAE',
    ad.value,
    case when ad.value = 'P.O. Box 7073, Umm Al Quwain, UAE' then 'OK' else 'DIFFERENT' end,
    case when ad.value = 'P.O. Box 7073, Umm Al Quwain, UAE' then 'Nothing to do.'
      else 'If the Umm Al Quwain address is right, change it in Settings > Company. If the current one is right, leave it.' end
  from address ad

  union all
  select
    5,
    'Mass Allied Freighters L.L.C',
    '1 client and 1 CRM record with full name and TRN 100286214000003, 0 invoices or quotes with a short name',
    m.clients || ' client (' || m.clients_full || ' full), ' || m.crm || ' CRM (' || m.crm_full || ' full), '
      || m.short_invoices || ' invoices and ' || m.short_quotes || ' quotes with a short name',
    case when m.clients >= 1 and m.clients_full >= 1 and m.crm >= 1 and m.crm_full >= 1
           and m.short_invoices = 0 and m.short_quotes = 0 then 'OK' else 'DIFFERENT' end,
    case
      when m.clients = 0 then 'Add the client in Clients with the letterhead details (name, TRN, office, address).'
      when m.clients_full = 0 then 'Open the client and fill in the full name, TRN 100286214000003, office and address.'
      when m.crm_full = 0 then 'Open the CRM record and set the full name and TRN (or add one if missing).'
      when m.short_invoices + m.short_quotes > 0 then 'Some invoices or quotes use a short name. They still match on the letterhead; rename them only if you want them identical.'
      else 'Nothing to do.'
    end
  from mass m

  union all
  select
    6,
    'Quote RR-01-26003 (VAT given as a discount)',
    'offset VAT on, discount 0, amount 4535.00',
    coalesce(
      (select 'offset VAT ' || case when q.offset_vat then 'on' else 'off' end
         || ', discount ' || q.discount_percent::numeric(8,2) || '% / ' || q.discount_amount::numeric(12,2)
         || ', amount ' || q.amount::numeric(12,2) from quote q),
      'quote not found'),
    coalesce(
      (select case when q.offset_vat and q.discount_percent = 0 and q.discount_amount = 0 and q.amount = 4535 then 'OK' else 'DIFFERENT' end from quote q),
      'CHECK'),
    coalesce(
      (select case when q.offset_vat and q.discount_percent = 0 and q.discount_amount = 0 and q.amount = 4535 then 'Nothing to do.'
         else 'If the client was promised VAT as a discount, open the quote, tick Offset VAT and save. If it was changed on purpose since, leave it.' end from quote q),
      'The quote is not in this database. Nothing to do unless it should be.')
) checks
order by 1;
