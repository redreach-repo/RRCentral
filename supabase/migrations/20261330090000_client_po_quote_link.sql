-- Link a client PO to its quotation, in any status, even after the quote has
-- expired (Alfred 2026-11-25, quote/CRM brief fix 5).
--
-- A client sometimes sends its PO after the quote's validity date. The PO
-- still belongs to that quote, so invoicing and filing can follow it:
--
-- * client_purchase_orders.quotation_id   the quote (the column already existed, unused)
-- * quote_reference                       the quote number when it was linked (kept if the quote is archived)
-- * quote_valid_until                     the quote's valid-until date when it was linked
-- * after_quote_expiry                    true when the PO is dated after that date (worked out, not typed)
-- * quote_linked_at / quote_linked_by     when and who
--
-- rr_client_po_link_quote(po, quote, award) links them and, when asked, marks
-- the quote Awarded straight from Finalized, Sent, Accepted, Expired or Not
-- awarded. No revision or validity extension is needed. A Superseded quote can
-- be linked but is not awarded (award its live revision instead). The quote's
-- number, lines and totals are never changed. A note goes on the quote's notes
-- log when that table exists (20261329090000_quote_revisions.sql).
-- rr_client_po_unlink_quote(po) removes the link (the quote status stays).
--
-- Changes to existing data: none. New columns start empty.
--
-- Access (same as client POs and quotations): admin / manager / sales link
-- and unlink; viewer, staff and strangers cannot; tenant isolation applies.
-- Both functions run as the caller (security invoker), so row level security
-- decides what they can see. AI connector keys need the admin scope.
--
-- Safe to re-run. Run after the client PO SQL (client_purchase_orders exists).
--
-- To reverse:
--   drop function if exists public.rr_client_po_link_quote(uuid, uuid, boolean);
--   drop function if exists public.rr_client_po_unlink_quote(uuid);
--   alter table public.client_purchase_orders
--     drop column if exists after_quote_expiry, drop column if exists quote_reference,
--     drop column if exists quote_valid_until, drop column if exists quote_linked_at,
--     drop column if exists quote_linked_by;

set client_min_messages = warning;

do $$
begin
  if to_regclass('public.client_purchase_orders') is null or to_regclass('public.quotations') is null then
    raise exception 'Run the client PO SQL first (client_purchase_orders or quotations is missing).';
  end if;
end $$;

alter table public.client_purchase_orders
  add column if not exists quotation_id uuid references public.quotations (id) on delete set null,
  add column if not exists quote_reference text not null default '',
  add column if not exists quote_valid_until date,
  add column if not exists quote_linked_at timestamptz,
  add column if not exists quote_linked_by text not null default '';

alter table public.client_purchase_orders
  add column if not exists after_quote_expiry boolean
  generated always as (
    coalesce(issued_on > quote_valid_until, false)
  ) stored;

create index if not exists client_purchase_orders_quotation_idx
  on public.client_purchase_orders (quotation_id) where quotation_id is not null;

comment on column public.client_purchase_orders.quotation_id is
  'The quotation this PO is for. Can be any status, including Expired.';
comment on column public.client_purchase_orders.quote_reference is
  'Quote number when the PO was linked (stays if the quote is archived).';
comment on column public.client_purchase_orders.quote_valid_until is
  'The quote''s valid-until date when the PO was linked.';
comment on column public.client_purchase_orders.after_quote_expiry is
  'True when the PO is dated after the quote''s validity ended.';

------------------------------------------------------------
-- Link
------------------------------------------------------------
create or replace function public.rr_client_po_link_quote(
  p_po uuid, p_quote uuid, p_award boolean default true
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  po record;
  q record;
  who text := lower(coalesce(public.rr_current_email(), ''));
  ref text;
  awarded boolean := false;
  days_late integer;
  po_client text := '';
  body text;
begin
  if public.rr_mcp_key_id() is not null
     and (to_regprocedure('public.rr_mcp_admin_key()') is null or not public.rr_mcp_admin_key()) then
    raise exception 'Linking a PO to a quote needs an AI connector key with the admin scope.' using errcode = '42501';
  end if;
  if not public.rr_is_staff() then
    raise exception 'Only sales, managers and admins can link a PO to a quote.' using errcode = '42501';
  end if;

  select * into po from public.client_purchase_orders where id = p_po for update;
  if not found then
    raise exception 'No client PO with that id is visible to you.' using errcode = 'P0002';
  end if;
  select * into q from public.quotations where id = p_quote for update;
  if not found then
    raise exception 'No quote with that id is visible to you.' using errcode = 'P0002';
  end if;
  if q.tenant_id is distinct from po.tenant_id then
    raise exception 'The PO and the quote belong to different companies.' using errcode = '42501';
  end if;
  if q.deleted_at is not null then
    raise exception 'Quote % is archived. Restore it first.', q.reference_number using errcode = '22023';
  end if;
  if q.status = 'Draft' then
    raise exception 'Quote % is still a draft. Finalize it before linking a PO.',
      coalesce(nullif(q.reference_number, ''), q.quote_id) using errcode = '22023';
  end if;
  ref := coalesce(nullif(btrim(q.reference_number), ''), q.quote_id, '');

  update public.client_purchase_orders
     set quotation_id = q.id,
         quote_reference = ref,
         quote_valid_until = q.valid_until,
         quote_linked_at = now(),
         quote_linked_by = who,
         updated_at = now()
   where id = po.id;

  if p_award and q.status in ('Finalized', 'Sent', 'Accepted', 'Expired', 'Not awarded') then
    update public.quotations
       set status = 'Awarded',
           outcome_reason = left(format('Client PO %s', po.po_number), 500),
           updated_by = coalesce(nullif(who, ''), updated_by),
           updated_at = now()
     where id = q.id;
    awarded := true;
  end if;

  days_late := case when po.issued_on is not null and q.valid_until is not null and po.issued_on > q.valid_until
                    then po.issued_on - q.valid_until end;

  if po.client_id is not null then
    select coalesce(c.company_name, '') into po_client from public.clients c where c.id = po.client_id;
  end if;

  if to_regclass('public.quote_notes') is not null then
    body := format('Client PO %s linked%s.%s%s',
      po.po_number,
      case when po.issued_on is not null then ' (PO dated ' || to_char(po.issued_on, 'FMDD Mon YYYY') || ')' else '' end,
      case when days_late is not null
           then format(' The PO came %s day%s after this quote''s validity ended on %s.',
                       days_late, case when days_late = 1 then '' else 's' end, to_char(q.valid_until, 'FMDD Mon YYYY'))
           else '' end,
      case when awarded then format(' Quote marked Awarded (was %s).', q.status)
           when q.status = 'Superseded' then ' This quote was superseded, so it was not marked Awarded.'
           else '' end);
    execute 'insert into public.quote_notes (quotation_id, kind, body) values ($1, ''note'', $2)'
      using q.id, body;
  end if;

  return jsonb_build_object(
    'po_id', po.id,
    'po_number', po.po_number,
    'quote_id', q.id,
    'quote_reference', ref,
    'quote_valid_until', q.valid_until,
    'previous_status', q.status,
    'awarded', awarded,
    'after_expiry', days_late is not null,
    'days_after_expiry', days_late,
    'client_mismatch', po_client <> '' and lower(btrim(po_client)) <> lower(btrim(coalesce(q.client, '')))
  );
end $$;

------------------------------------------------------------
-- Unlink
------------------------------------------------------------
create or replace function public.rr_client_po_unlink_quote(p_po uuid)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  po record;
begin
  if public.rr_mcp_key_id() is not null
     and (to_regprocedure('public.rr_mcp_admin_key()') is null or not public.rr_mcp_admin_key()) then
    raise exception 'Unlinking a PO needs an AI connector key with the admin scope.' using errcode = '42501';
  end if;
  if not public.rr_is_staff() then
    raise exception 'Only sales, managers and admins can unlink a PO from a quote.' using errcode = '42501';
  end if;
  select * into po from public.client_purchase_orders where id = p_po for update;
  if not found then
    raise exception 'No client PO with that id is visible to you.' using errcode = 'P0002';
  end if;
  update public.client_purchase_orders
     set quotation_id = null, quote_reference = '', quote_valid_until = null,
         quote_linked_at = null, quote_linked_by = '', updated_at = now()
   where id = po.id;
  if po.quotation_id is not null and to_regclass('public.quote_notes') is not null
     and exists (select 1 from public.quotations where id = po.quotation_id) then
    execute 'insert into public.quote_notes (quotation_id, kind, body) values ($1, ''note'', $2)'
      using po.quotation_id, format('Client PO %s unlinked from this quote. The quote status was left as it is.', po.po_number);
  end if;
  return jsonb_build_object('po_id', po.id, 'unlinked_quote_id', po.quotation_id);
end $$;

revoke all on function public.rr_client_po_link_quote(uuid, uuid, boolean) from public;
revoke all on function public.rr_client_po_unlink_quote(uuid) from public;
grant execute on function public.rr_client_po_link_quote(uuid, uuid, boolean) to authenticated;
grant execute on function public.rr_client_po_unlink_quote(uuid) to authenticated;

notify pgrst, 'reload schema';
