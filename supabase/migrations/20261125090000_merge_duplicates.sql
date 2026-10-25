-- Wave 4, PR T: duplicates. The Duplicates page finds accounts and contacts
-- that look like the same one (phone, email, website or a similar name). A
-- manager or admin merges a pair: everything on the duplicate moves to the
-- one kept (timeline, contacts, tickets, quotes, invoices, deals, contracts,
-- build, usage...), blank details are filled from the duplicate, a line goes
-- on the timeline, and the duplicate is removed. "Not a duplicate" hides a
-- pair for good. Safe to run more than once.

create table if not exists public.duplicate_dismissals (
  id uuid primary key default uuid_generate_v4(),
  kind text not null check (kind in ('account', 'contact')),
  -- The pair, smaller id first, so each pair is stored once.
  a_id uuid not null,
  b_id uuid not null,
  dismissed_by text not null default '',
  created_at timestamptz not null default now(),
  check (a_id < b_id),
  unique (kind, a_id, b_id)
);

alter table public.duplicate_dismissals enable row level security;
revoke all on public.duplicate_dismissals from anon;
grant select, insert, delete on public.duplicate_dismissals to authenticated;
drop policy if exists "Staff full access" on public.duplicate_dismissals;
drop policy if exists "Viewers read" on public.duplicate_dismissals;
drop policy if exists "Managers read dismissed pairs" on public.duplicate_dismissals;
create policy "Managers read dismissed pairs" on public.duplicate_dismissals
  for select to authenticated using (public.rr_is_manager_or_admin());
drop policy if exists "Managers dismiss pairs" on public.duplicate_dismissals;
create policy "Managers dismiss pairs" on public.duplicate_dismissals
  for insert to authenticated with check (public.rr_is_manager_or_admin());
drop policy if exists "Managers undo dismissals" on public.duplicate_dismissals;
create policy "Managers undo dismissals" on public.duplicate_dismissals
  for delete to authenticated using (public.rr_is_manager_or_admin());

-- Moves every row that points at `dup` (through a foreign key to `target`) to
-- `keep`. A row that would clash with one `keep` already has (one usage row
-- per month, one WorshipHub profile...) stays behind and goes with the
-- duplicate; those are counted under "left".
create or replace function public.rr_repoint_rows(target regclass, keep uuid, dup uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  fk record;
  r record;
  n integer;
  moved jsonb := '{}'::jsonb;
  left_behind jsonb := '{}'::jsonb;
  stuck integer;
begin
  for fk in
    select c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = target and array_length(c.conkey, 1) = 1
    order by 1, 2
  loop
    begin
      execute format('update %s set %I = $1 where %I = $2', fk.tbl, fk.col, fk.col) using keep, dup;
      get diagnostics n = row_count;
      if n > 0 then moved := moved || jsonb_build_object(fk.tbl::text, n); end if;
    exception when unique_violation then
      -- Row by row: move what fits, leave what clashes.
      n := 0;
      stuck := 0;
      for r in execute format('select ctid from %s where %I = $1', fk.tbl, fk.col) using dup loop
        begin
          execute format('update %s set %I = $1 where ctid = $2', fk.tbl, fk.col) using keep, r.ctid;
          n := n + 1;
        exception when unique_violation then
          stuck := stuck + 1;
        end;
      end loop;
      if n > 0 then moved := moved || jsonb_build_object(fk.tbl::text, n); end if;
      if stuck > 0 then left_behind := left_behind || jsonb_build_object(fk.tbl::text, stuck); end if;
    end;
  end loop;
  return jsonb_build_object('moved', moved, 'left', left_behind);
end $$;

revoke all on function public.rr_repoint_rows(regclass, uuid, uuid) from public;
revoke all on function public.rr_repoint_rows(regclass, uuid, uuid) from authenticated;

create or replace function public.rr_merge_accounts(keep uuid, dup uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  k public.accounts;
  d public.accounts;
  result jsonb;
  who text := coalesce(public.rr_current_email(), '');
begin
  if not public.rr_is_manager_or_admin() then
    raise exception 'Only managers and admins can merge accounts' using errcode = '42501';
  end if;
  if keep is null or dup is null or keep = dup then
    raise exception 'Pick two different accounts';
  end if;
  select * into k from public.accounts where id = keep for update;
  select * into d from public.accounts where id = dup for update;
  if k.id is null or d.id is null then
    raise exception 'One of the accounts is gone';
  end if;

  -- The duplicate's primary contact stops being primary when the kept account has one.
  if exists (select 1 from public.account_contacts where account_id = keep and is_primary) then
    update public.account_contacts set is_primary = false where account_id = dup and is_primary;
  end if;

  result := public.rr_repoint_rows('public.accounts'::regclass, keep, dup);

  -- Fill the kept account's blank details from the duplicate.
  update public.accounts set
    industry = case when btrim(industry) = '' then d.industry else industry end,
    country = case when btrim(country) = '' then d.country else country end,
    city = case when btrim(city) = '' then d.city else city end,
    website = case when btrim(website) = '' then d.website else website end,
    source = case when btrim(source) = '' then d.source else source end,
    owner_user_id = coalesce(owner_user_id, d.owner_user_id),
    notes = case
      when btrim(d.notes) = '' then notes
      when btrim(notes) = '' then d.notes
      else notes || E'\n\n' || 'From ' || d.name || ': ' || d.notes
    end,
    updated_at = now()
  where id = keep;

  insert into public.account_activities (account_id, kind, body, user_email)
  values (
    keep,
    'system',
    format('Merged %s (%s) into this account. Moved: %s.%s', d.name, d.reference,
      coalesce((select string_agg(format('%s %s', value, key), ', ') from jsonb_each_text(result -> 'moved')), 'nothing'),
      case when result -> 'left' = '{}'::jsonb then ''
        else format(' Not moved because this account already has them: %s.',
          (select string_agg(format('%s %s', value, key), ', ') from jsonb_each_text(result -> 'left')))
      end),
    who
  );

  delete from public.accounts where id = dup;
  return result || jsonb_build_object('kept', keep, 'removed', d.name);
end $$;

revoke all on function public.rr_merge_accounts(uuid, uuid) from public;
grant execute on function public.rr_merge_accounts(uuid, uuid) to authenticated;

create or replace function public.rr_merge_contacts(keep uuid, dup uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  k public.account_contacts;
  d public.account_contacts;
  result jsonb;
  who text := coalesce(public.rr_current_email(), '');
begin
  if not public.rr_is_manager_or_admin() then
    raise exception 'Only managers and admins can merge contacts' using errcode = '42501';
  end if;
  if keep is null or dup is null or keep = dup then
    raise exception 'Pick two different contacts';
  end if;
  select * into k from public.account_contacts where id = keep for update;
  select * into d from public.account_contacts where id = dup for update;
  if k.id is null or d.id is null then
    raise exception 'One of the contacts is gone';
  end if;

  result := public.rr_repoint_rows('public.account_contacts'::regclass, keep, dup);

  update public.account_contacts set
    role = case when btrim(role) = '' then d.role else role end,
    email = case when btrim(email) = '' then d.email else email end,
    phone = case when btrim(phone) = '' then d.phone else phone end,
    whatsapp = case when btrim(whatsapp) = '' then d.whatsapp else whatsapp end,
    is_primary = is_primary or (d.is_primary and d.account_id = k.account_id)
  where id = keep;

  insert into public.account_activities (account_id, kind, body, user_email)
  values (
    k.account_id,
    'system',
    format('Merged contact %s into %s.%s', d.name, k.name,
      case when d.account_id <> k.account_id then ' The duplicate was on another account.' else '' end),
    who
  );

  delete from public.account_contacts where id = dup;
  return result || jsonb_build_object('kept', keep, 'removed', d.name);
end $$;

revoke all on function public.rr_merge_contacts(uuid, uuid) from public;
grant execute on function public.rr_merge_contacts(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
