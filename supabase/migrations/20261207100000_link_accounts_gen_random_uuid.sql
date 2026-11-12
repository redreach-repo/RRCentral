-- rr_link_accounts used uuid_generate_v4() from uuid-ossp. Some projects never
-- enabled that extension (or it is not on search_path). Prefer gen_random_uuid()
-- which is built into PostgreSQL 13+ (no extension create — installing pgcrypto
-- into public breaks Supabase catch-up checks that expect extensions.crypt).

create or replace function public.rr_link_accounts(p_dry_run boolean default true)
returns table (
  kind text,
  table_name text,
  row_id uuid,
  row_label text,
  account_id uuid,
  account_name text,
  account_reference text,
  batch_id uuid
)
language plpgsql
set search_path = public
as $$
declare
  v_batch uuid := case when p_dry_run then null else gen_random_uuid() end;
begin
  create temp table if not exists rr_link_candidates (
    kind text, table_name text, row_id uuid, row_label text,
    account_id uuid, account_name text, account_reference text
  ) on commit drop;
  truncate rr_link_candidates;

  insert into rr_link_candidates
  with acct as (
    select a.id, a.name, a.reference, public.rr_normalize_company_name(a.name) as k,
      count(*) over (partition by public.rr_normalize_company_name(a.name)) as dupes
    from public.accounts a
    where public.rr_normalize_company_name(a.name) <> ''
  ),
  rows_ as (
    select 'clients'::text as t, c.id, c.company_name as name, c.company_name as label,
      c.account_id as linked
      from public.clients c
    union all
    select 'quotations', q.id, q.client, q.client || ' (' || q.reference_number || ')', q.account_id
      from public.quotations q
    union all
    select 'invoices', i.id, i.client, i.client || ' (' || i.reference_number || ')', i.account_id
      from public.invoices i
    union all
    select 'crm', r.id, r.company_name, r.company_name, r.account_id
      from public.crm r
  ),
  keyed as (
    select r.*, public.rr_normalize_company_name(r.name) as k from rows_ r
  )
  select
    case
      when k.linked is not null then 'already_linked'
      when a.id is null then 'unmatched'
      when a.dupes > 1 then 'ambiguous'
      else 'match'
    end,
    k.t, k.id, k.label, a.id, a.name, a.reference
  from keyed k
  left join acct a on a.k = k.k and k.k <> '';

  insert into rr_link_candidates
  select 'account_without_match', 'accounts', a.id, a.name, a.id, a.name, a.reference
  from public.accounts a
  where not exists (
    select 1 from rr_link_candidates c
    where c.account_id = a.id and c.kind in ('match', 'already_linked')
  );

  if not p_dry_run then
    insert into public.account_link_log (batch_id, table_name, row_id, account_id)
    select v_batch, c.table_name, c.row_id, c.account_id
    from rr_link_candidates c where c.kind = 'match';

    update public.clients t set account_id = c.account_id
      from rr_link_candidates c
      where c.kind = 'match' and c.table_name = 'clients' and t.id = c.row_id and t.account_id is null;
    update public.quotations t set account_id = c.account_id
      from rr_link_candidates c
      where c.kind = 'match' and c.table_name = 'quotations' and t.id = c.row_id and t.account_id is null;
    update public.invoices t set account_id = c.account_id
      from rr_link_candidates c
      where c.kind = 'match' and c.table_name = 'invoices' and t.id = c.row_id and t.account_id is null;
    update public.crm t set account_id = c.account_id
      from rr_link_candidates c
      where c.kind = 'match' and c.table_name = 'crm' and t.id = c.row_id and t.account_id is null;
  end if;

  return query
    select c.kind, c.table_name, c.row_id, c.row_label, c.account_id, c.account_name,
      c.account_reference, v_batch
    from rr_link_candidates c
    order by
      array_position(array['match', 'ambiguous', 'account_without_match', 'unmatched', 'already_linked'], c.kind),
      c.table_name, c.row_label;
end;
$$;

revoke all on function public.rr_link_accounts(boolean) from public, anon, authenticated;

notify pgrst, 'reload schema';
