-- Revise and extend sent quotes (HighMast improvement brief, fix 2, Alfred 2026-11-25).
--
-- A Finalized, Sent or Expired quote stays locked. Instead of editing it:
--
-- * Revise           makes a new Draft copy: same base reference, revision + 1,
--                    number shown as RR-01-26008-R1. Client, contact, account,
--                    lines (description, SKU, qty, unit price, unit cost, VAT,
--                    sizes), payment and delivery terms, MOQ, notes, discount and
--                    every currency / FX field are copied. The new valid-until
--                    date is chosen on the way in (default: old date + 14 days).
-- * Finalizing a revision keeps its -R number and marks every earlier live
--                    quote of the same base reference "Superseded". The old
--                    quote's totals, lines and PDF are not touched; it gets a
--                    note pointing at the new revision.
-- * Extend validity  the same in one step, when only the date changes: the
--                    revision is made and finalized at once (Sent stays Sent),
--                    with who extended it and why.
-- * Quote notes      an append-only log on every quote, in every status:
--                    when, who, what. A revision shows the notes of the whole
--                    chain (all quotes with the same base reference), and the
--                    deal that carries the quote reference shows them too.
--
-- Only one live revision per base reference: one open Draft revision at a time,
-- and finalizing supersedes all the others.
--
-- Changes to existing data: none. Two new columns on quotations (revised_from,
-- revision_reason) start empty; existing quote numbers, totals and history stay
-- as they are.
--
-- Access (same as quotations):
--   admin / manager / sales  revise, extend, add notes
--   viewer                   read notes only
--   staff                    nothing (they cannot see quotes either)
--   nobody                   changes or removes a note (append only)
-- Plus tenant isolation; a note always takes its quote's tenant.
--
-- AI connector keys: any key that reaches quotes may add notes. Revise and
-- extend create a quote, so they need an admin-scope key with the sales or
-- finance department (the same rule as create_quote). No key edits or removes
-- notes. Every AI revise / extend is written to the audit log.
--
-- Safe to re-run.
--
-- To reverse:
--   drop trigger if exists rr_quote_revision_guard on public.quotations;
--   drop trigger if exists rr_quote_revision_finalized on public.quotations;
--   drop function if exists public.rr_quote_revise(uuid, date, text, boolean, jsonb);
--   drop function if exists public.rr_quote_extend_validity(uuid, date, text, jsonb);
--   drop function if exists public.rr_quote_finalize_revision(uuid, text, jsonb);
--   drop function if exists public.rr_quote_revision_guard();
--   drop function if exists public.rr_quote_revision_finalized();
--   drop function if exists public.rr_quote_note_stamp();
--   drop function if exists public.rr_quote_base(public.quotations);
--   drop table if exists public.quote_notes;
--   drop index if exists public.quotations_one_open_revision;
--   drop index if exists public.quotations_base_reference_idx;
--   alter table public.quotations drop column if exists revision_reason;
--   alter table public.quotations drop column if exists revised_from;
--   (revisions already made stay as ordinary quotes; nothing else changes)

set client_min_messages = warning;

do $$
begin
  if to_regclass('public.quotations') is null or to_regclass('public.tenants') is null then
    raise exception 'Run the platform tenancy migration first (quotations or tenants is missing).';
  end if;
end $$;

------------------------------------------------------------
-- 1. Columns on quotations
------------------------------------------------------------
alter table public.quotations add column if not exists deleted_at timestamptz;
alter table public.quotations add column if not exists sent_at timestamptz;
alter table public.quotations add column if not exists revised_from uuid;
alter table public.quotations add column if not exists revision_reason text not null default '';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'quotations_revised_from_fkey') then
    alter table public.quotations
      add constraint quotations_revised_from_fkey
      foreign key (revised_from) references public.quotations (id) on delete set null;
  end if;
end $$;

comment on column public.quotations.revised_from is
  'The quote this revision was made from (Revise or Extend validity). Null for ordinary quotes.';
comment on column public.quotations.revision_reason is
  'Why the revision was made (required for Extend validity).';

create index if not exists quotations_base_reference_idx
  on public.quotations (base_reference) where base_reference <> '';

-- One open Draft revision per base reference. Skipped (with a notice) if live
-- data already breaks it; the functions below check it either way.
do $$
begin
  create unique index if not exists quotations_one_open_revision
    on public.quotations (tenant_id, base_reference)
    where status = 'Draft' and revised_from is not null and deleted_at is null;
exception when others then
  raise notice 'quotations_one_open_revision not created: %', sqlerrm;
end $$;

------------------------------------------------------------
-- 2. Quote notes (append only)
------------------------------------------------------------
create table if not exists public.quote_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade
    default 'a0000000-0000-4000-8000-000000000001'::uuid,
  quotation_id uuid not null references public.quotations (id) on delete cascade,
  -- The quote's number and base number when the note was written (Draft quotes have none).
  quote_ref text not null default '',
  base_reference text not null default '',
  kind text not null default 'note'
    check (kind in ('note', 'revised', 'extended', 'superseded', 'finalized')),
  body text not null check (length(btrim(body)) > 0 and length(body) <= 4000),
  created_by uuid references public.app_users (id) on delete set null,
  created_by_email text not null default '',
  source text not null default 'app' check (source in ('app', 'ai')),
  created_at timestamptz not null default now()
);

create index if not exists quote_notes_quote_idx on public.quote_notes (quotation_id, created_at desc);
create index if not exists quote_notes_base_idx on public.quote_notes (tenant_id, base_reference, created_at desc)
  where base_reference <> '';

comment on table public.quote_notes is
  'Append-only notes and activity on a quote (works in every status). A revision shows the notes of its whole chain.';

-- Tenant, number, who and when always come from the quote and the session.
create or replace function public.rr_quote_note_stamp()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  q record;
begin
  select x.tenant_id, x.reference_number, x.base_reference, x.quote_id
    into q from public.quotations x where x.id = new.quotation_id;
  if not found then
    raise exception 'Quote not found.' using errcode = 'P0002';
  end if;
  new.tenant_id := q.tenant_id;
  new.quote_ref := coalesce(nullif(btrim(q.reference_number), ''), 'Draft ' || coalesce(q.quote_id, ''));
  new.base_reference := coalesce(nullif(btrim(q.base_reference), ''), nullif(btrim(q.reference_number), ''), '');
  new.body := btrim(new.body);
  if auth.uid() is not null then
    new.created_by := public.rr_current_user_id();
    new.created_by_email := coalesce(public.rr_current_email(), '');
  end if;
  new.source := case when public.rr_mcp_key_id() is null then 'app' else 'ai' end;
  new.created_at := now();
  return new;
end $$;

revoke all on function public.rr_quote_note_stamp() from public;

drop trigger if exists rr_quote_note_stamp on public.quote_notes;
create trigger rr_quote_note_stamp before insert on public.quote_notes
  for each row execute function public.rr_quote_note_stamp();

------------------------------------------------------------
-- 3. Row level security on quote_notes
------------------------------------------------------------
alter table public.quote_notes enable row level security;
revoke all on public.quote_notes from anon, authenticated;
-- Append only: people can read and add, never change or remove.
grant select, insert on public.quote_notes to authenticated;

drop policy if exists "Staff full access" on public.quote_notes;
drop policy if exists "Authenticated users full access" on public.quote_notes;
drop policy if exists "Staff read" on public.quote_notes;
create policy "Staff read" on public.quote_notes for select to authenticated
  using (public.rr_is_staff());
drop policy if exists "Viewers read" on public.quote_notes;
create policy "Viewers read" on public.quote_notes for select to authenticated
  using (public.rr_current_role() = 'viewer');
drop policy if exists "Staff insert" on public.quote_notes;
create policy "Staff insert" on public.quote_notes for insert to authenticated
  with check (public.rr_is_staff());
drop policy if exists "Tenant isolation" on public.quote_notes;
create policy "Tenant isolation" on public.quote_notes as restrictive for all to authenticated
  using (public.rr_same_tenant(tenant_id)) with check (public.rr_same_tenant(tenant_id));

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rr_audit_trigger'
  ) then
    drop trigger if exists rr_audit on public.quote_notes;
    create trigger rr_audit after insert or update or delete on public.quote_notes
      for each row execute function public.rr_audit_trigger();
  end if;
end $$;

-- AI connector: every key that reaches quotes may add a note; none edits or
-- removes one (there is no update or delete grant at all). The general MCP
-- loops ran before this table existed, so their policies are added here.
do $$
begin
  if to_regprocedure('public.rr_mcp_key_id()') is null then
    return;
  end if;
  execute 'drop policy if exists "MCP never deletes" on public.quote_notes';
  execute 'create policy "MCP never deletes" on public.quote_notes as restrictive for delete to authenticated
             using (public.rr_mcp_key_id() is null)';
  execute 'drop policy if exists "MCP adds only leads and notes" on public.quote_notes';
  execute 'drop policy if exists "MCP changes only deals" on public.quote_notes';
  if to_regprocedure('public.rr_mcp_dept_allows(text, boolean)') is not null then
    execute 'drop policy if exists "MCP department reach" on public.quote_notes';
    execute 'drop policy if exists "MCP department reach (add)" on public.quote_notes';
    execute 'drop policy if exists "MCP department reach (change)" on public.quote_notes';
    execute 'drop policy if exists "MCP department reach (remove)" on public.quote_notes';
    execute 'create policy "MCP department reach" on public.quote_notes as restrictive for select to authenticated
               using ((select public.rr_mcp_dept_allows(''quotations'', false)))';
    execute 'create policy "MCP department reach (add)" on public.quote_notes as restrictive for insert to authenticated
               with check ((select public.rr_mcp_dept_allows(''quotations'', false)))';
  end if;
end $$;

------------------------------------------------------------
-- 4. Revision rules that hold on every path (app, AI, SQL)
------------------------------------------------------------
-- The base number of a quote: base_reference, or its number without a revision suffix.
create or replace function public.rr_quote_base(q public.quotations)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(btrim(q.base_reference), ''),
    nullif(regexp_replace(btrim(coalesce(q.reference_number, '')), '(_revision\s+\d+|-R\d+)$', '', 'i'), '')
  )
$$;

-- A revision keeps its number; a finalized revision never goes back to Draft;
-- it can only be finalized while nothing in its chain has been accepted.
create or replace function public.rr_quote_revision_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.revised_from is null then
    return new;
  end if;
  new.reference_number := old.reference_number;
  new.base_reference := old.base_reference;
  new.revision := old.revision;
  new.revised_from := old.revised_from;
  if old.status <> 'Draft' and new.status = 'Draft' then
    raise exception 'Revision % is % and cannot go back to Draft. Revise it again instead.',
      old.reference_number, old.status using errcode = '22023';
  end if;
  if old.status = 'Draft' and new.status <> 'Draft' then
    if new.status not in ('Finalized', 'Sent') then
      raise exception 'A draft revision is finalized (or sent) first.' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.quotations s
      where (s.base_reference = old.base_reference or s.id = old.revised_from
             or (btrim(s.base_reference) = '' and s.reference_number = old.base_reference))
        and s.id <> old.id and s.deleted_at is null
        and s.status in ('Accepted', 'Awarded')
    ) then
      raise exception 'Another quote of % has been accepted or awarded, so revision % cannot replace it.',
        old.base_reference, old.reference_number using errcode = '22023';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists rr_quote_revision_guard on public.quotations;
create trigger rr_quote_revision_guard before update on public.quotations
  for each row execute function public.rr_quote_revision_guard();

-- Finalizing a revision supersedes every other live quote of the same base.
-- The old quotes keep their totals, lines and PDF; only the status changes.
create or replace function public.rr_quote_revision_finalized()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  o record;
begin
  if new.revised_from is null or old.status <> 'Draft' or new.status = 'Draft' then
    return null;
  end if;
  for o in
    select s.id, s.reference_number, s.status from public.quotations s
    where (s.base_reference = new.base_reference or s.id = new.revised_from
           or (btrim(s.base_reference) = '' and s.reference_number = new.base_reference))
      and s.id <> new.id and s.deleted_at is null
      and s.status in ('Finalized', 'Sent', 'Expired')
    for update
  loop
    update public.quotations
       set status = 'Superseded',
           updated_by = lower(coalesce(public.rr_current_email(), updated_by)),
           updated_at = now()
     where id = o.id;
    insert into public.quote_notes (quotation_id, kind, body)
    values (o.id, 'superseded',
            format('Superseded by %s (was %s). This quote''s totals and PDF are unchanged.', new.reference_number, o.status));
  end loop;
  insert into public.quote_notes (quotation_id, kind, body)
  values (new.id, 'finalized',
          format('Revision %s finalized as %s, valid until %s.', new.reference_number, new.status,
                 coalesce(to_char(new.valid_until, 'FMDD Mon YYYY'), 'not set')));
  return null;
end $$;

drop trigger if exists rr_quote_revision_finalized on public.quotations;
create trigger rr_quote_revision_finalized after update of status on public.quotations
  for each row execute function public.rr_quote_revision_finalized();

------------------------------------------------------------
-- 5. Revise, finalize a revision, extend validity
------------------------------------------------------------
-- All three run as the caller (security invoker), so the caller's row level
-- security and the AI guards apply exactly as they do to the screens.

create or replace function public.rr_quote_finalize_revision(
  p_id uuid, p_status text default 'Finalized', p_args jsonb default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  q public.quotations%rowtype;
  before_row jsonb;
  superseded jsonb;
begin
  if p_status not in ('Finalized', 'Sent') then
    raise exception 'A revision is finalized as Finalized or Sent.' using errcode = '22023';
  end if;
  select * into q from public.quotations where id = p_id for update;
  if not found then
    raise exception 'No quote with that id is visible to you.' using errcode = 'P0002';
  end if;
  if q.revised_from is null then
    raise exception 'Quote % is not a revision. Finalize it the usual way.', coalesce(nullif(q.reference_number, ''), q.quote_id)
      using errcode = '22023';
  end if;
  if q.status <> 'Draft' then
    raise exception 'Revision % is % already.', q.reference_number, q.status using errcode = '22023';
  end if;
  if q.deleted_at is not null then
    raise exception 'Revision % is archived. Restore it first.', q.reference_number using errcode = '22023';
  end if;
  if coalesce(btrim(q.client), '') = '' then
    raise exception 'The revision needs a client.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.line_items where doc_type = 'Quote' and reference = q.quote_id) then
    raise exception 'Revision % has no lines.', q.reference_number using errcode = '22023';
  end if;
  if q.valid_until is null then
    raise exception 'Set a valid-until date on revision % first.', q.reference_number using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('rr_quote_rev:' || q.tenant_id::text || ':' || q.base_reference, 0));
  before_row := to_jsonb(q);

  update public.quotations
     set status = p_status,
         deal_ref = coalesce(nullif(btrim(deal_ref), ''), base_reference),
         updated_by = lower(coalesce(public.rr_current_email(), '')),
         updated_at = now()
   where id = p_id
  returning * into q;

  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'reference', s.reference_number) order by s.revision), '[]'::jsonb)
    into superseded
    from public.quotations s
   where s.base_reference = q.base_reference and s.id <> q.id and s.status = 'Superseded' and s.deleted_at is null;

  if public.rr_mcp_key_id() is not null and to_regprocedure('public.rr_mcp_admin_key()') is not null
     and public.rr_mcp_admin_key() then
    perform public.rr_mcp_log_write('finalize_quote_revision', coalesce(p_args, jsonb_build_object('quote_id', p_id)),
                                    'quotations', q.id::text, before_row, to_jsonb(q));
  end if;
  return jsonb_build_object('quote', to_jsonb(q), 'superseded', superseded);
end $$;

create or replace function public.rr_quote_revise(
  p_id uuid,
  p_valid_until date default null,
  p_reason text default '',
  p_extend boolean default false,
  p_args jsonb default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  q public.quotations%rowtype;
  nr public.quotations%rowtype;
  base text;
  next_rev integer;
  new_id uuid := gen_random_uuid();
  new_qid text;
  new_ref text;
  until date;
  reason text := btrim(coalesce(p_reason, ''));
  who text := lower(coalesce(public.rr_current_email(), ''));
  blocker record;
  lines integer;
  fin jsonb;
  new_status text;
begin
  -- AI keys: creating a quote needs an admin-scope key (as create_quote does).
  if public.rr_mcp_key_id() is not null
     and (to_regprocedure('public.rr_mcp_admin_key()') is null or not public.rr_mcp_admin_key()) then
    raise exception 'Revising or extending a quote needs an AI connector key with the admin scope.' using errcode = '42501';
  end if;
  if not public.rr_is_staff() then
    raise exception 'Only sales, managers and admins can revise quotes.' using errcode = '42501';
  end if;
  if length(reason) > 1000 then
    raise exception 'Keep the reason under 1,000 characters.' using errcode = '22023';
  end if;
  if p_extend and reason = '' then
    raise exception 'Say why the validity is extended (for example the meeting it was agreed in).' using errcode = '22023';
  end if;

  select * into q from public.quotations where id = p_id for update;
  if not found then
    raise exception 'No quote with that id is visible to you.' using errcode = 'P0002';
  end if;
  if q.deleted_at is not null then
    raise exception 'Quote % is archived. Restore it first.', q.reference_number using errcode = '22023';
  end if;
  if q.status not in ('Finalized', 'Sent', 'Expired') then
    raise exception 'Quote % is %. Only Finalized, Sent or Expired quotes can be revised or extended.',
      coalesce(nullif(q.reference_number, ''), q.quote_id), q.status using errcode = '22023';
  end if;
  base := public.rr_quote_base(q);
  if base is null then
    raise exception 'Finalize the quote before revising it.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('rr_quote_rev:' || q.tenant_id::text || ':' || base, 0));

  -- One live revision per base reference.
  select s.reference_number, s.status into blocker from public.quotations s
   where s.base_reference = base and s.id <> q.id and s.deleted_at is null
     and s.status = 'Draft' and s.revised_from is not null
   limit 1;
  if found then
    raise exception 'Revision % of % is already open as a draft. Finish or archive it first.', blocker.reference_number, base
      using errcode = '23505';
  end if;
  select s.reference_number, s.status into blocker from public.quotations s
   where s.base_reference = base and s.id <> q.id and s.deleted_at is null
     and s.status not in ('Draft', 'Superseded', 'Not awarded')
     and s.revision > coalesce(q.revision, 0)
   order by s.revision desc
   limit 1;
  if found then
    raise exception 'Quote % has a newer revision, % (%). Revise that one.', q.reference_number, blocker.reference_number, blocker.status
      using errcode = '22023';
  end if;

  until := coalesce(p_valid_until, greatest(coalesce(q.valid_until, current_date) + 14, current_date + 14));
  if until < current_date then
    raise exception 'The new valid-until date (%) is in the past.', until using errcode = '22023';
  end if;
  if p_extend and q.valid_until is not null and until <= q.valid_until then
    raise exception 'Pick a date after the current valid-until date (%).', q.valid_until using errcode = '22023';
  end if;

  select greatest(coalesce(max(s.revision), 0), coalesce(q.revision, 0)) + 1 into next_rev
    from public.quotations s where s.base_reference = base;
  new_ref := base || '-R' || next_rev;
  if exists (select 1 from public.quotations s where s.reference_number = new_ref) then
    raise exception 'Quote number % is already taken.', new_ref using errcode = '23505';
  end if;
  new_qid := 'Q-' || (floor(extract(epoch from clock_timestamp()) * 1000))::bigint::text;
  while exists (select 1 from public.quotations s where s.quote_id = new_qid)
     or exists (select 1 from public.line_items l where l.doc_type = 'Quote' and l.reference = new_qid) loop
    new_qid := new_qid || 'r';
  end loop;

  -- Copy every column of the quote, then set what a new revision changes.
  insert into public.quotations
  select (jsonb_populate_record(null::public.quotations, to_jsonb(q) || jsonb_build_object(
    'id', new_id,
    'status', 'Draft',
    'reference_number', new_ref,
    'base_reference', base,
    'revision', next_rev,
    'quote_id', new_qid,
    'deal_ref', coalesce(nullif(btrim(q.deal_ref), ''), base),
    'date', current_date,
    'valid_until', until,
    'revised_from', q.id,
    'revision_reason', reason,
    'outcome_reason', '',
    'sent_at', null,
    'followed_up_at', null,
    'deleted_at', null,
    'created_by', who,
    'updated_by', who,
    'created_at', now(),
    'updated_at', now()
  ))).*
  returning * into nr;

  -- Copy every line (description, SKU, qty, prices, cost, VAT, sizes, remarks).
  insert into public.line_items
  select (jsonb_populate_record(null::public.line_items, to_jsonb(l) || jsonb_build_object(
    'id', gen_random_uuid(),
    'reference', new_qid,
    'created_at', now()
  ))).*
  from public.line_items l
  where l.doc_type = 'Quote' and l.reference = q.quote_id
  order by l.line_no;
  get diagnostics lines = row_count;

  insert into public.quote_notes (quotation_id, kind, body)
  values (nr.id, case when p_extend then 'extended' else 'revised' end,
    case when p_extend then
      format('Validity extended from %s to %s (%s replaces %s). Reason: %s',
             coalesce(to_char(q.valid_until, 'FMDD Mon YYYY'), 'not set'), to_char(until, 'FMDD Mon YYYY'),
             new_ref, q.reference_number, reason)
    else
      format('Revision %s made from %s (%s), valid until %s.%s', new_ref, q.reference_number, q.status,
             to_char(until, 'FMDD Mon YYYY'), case when reason <> '' then ' Reason: ' || reason else '' end)
    end);

  if public.rr_mcp_key_id() is not null then
    perform public.rr_mcp_log_write(case when p_extend then 'extend_quote_validity' else 'revise_quote' end,
      coalesce(p_args, jsonb_build_object('quote_id', p_id, 'valid_until', until, 'reason', reason)),
      'quotations', nr.id::text, to_jsonb(q), to_jsonb(nr));
  end if;

  if p_extend then
    -- Only the date changes: finalize at once. A quote the client already had stays Sent.
    new_status := case when q.status = 'Sent' or q.sent_at is not null then 'Sent' else 'Finalized' end;
    fin := public.rr_quote_finalize_revision(nr.id, new_status, p_args);
    select * into nr from public.quotations where id = nr.id;
  end if;

  return jsonb_build_object(
    'quote', to_jsonb(nr),
    'lines_copied', lines,
    'revised_from', jsonb_build_object('id', q.id, 'reference', q.reference_number, 'status', q.status,
                                       'valid_until', q.valid_until),
    'extended', p_extend,
    'superseded', coalesce(fin -> 'superseded', '[]'::jsonb)
  );
end $$;

create or replace function public.rr_quote_extend_validity(
  p_id uuid, p_valid_until date, p_reason text, p_args jsonb default null
)
returns jsonb
language sql
volatile
security invoker
set search_path = public
as $$
  select public.rr_quote_revise(p_id, p_valid_until, p_reason, true, p_args)
$$;

revoke all on function public.rr_quote_revise(uuid, date, text, boolean, jsonb) from public;
revoke all on function public.rr_quote_extend_validity(uuid, date, text, jsonb) from public;
revoke all on function public.rr_quote_finalize_revision(uuid, text, jsonb) from public;
grant execute on function public.rr_quote_revise(uuid, date, text, boolean, jsonb) to authenticated;
grant execute on function public.rr_quote_extend_validity(uuid, date, text, jsonb) to authenticated;
grant execute on function public.rr_quote_finalize_revision(uuid, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
