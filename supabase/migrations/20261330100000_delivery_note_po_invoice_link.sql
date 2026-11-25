-- Delivery notes point at the client PO and the invoice (Alfred 2026-11-25:
-- quotation -> PO -> delivery notes -> invoices -> payments, each linked to
-- the one before).
--
-- Until now a delivery note only carried the quote number (quote_ref). This adds:
--
-- * client_po_id   the client PO the goods were delivered against
-- * invoice_ref    the invoice number that billed this delivery
--
-- The app fills both in by itself where it can: a delivery note made from a
-- quote takes the quote's client PO (when the quote has exactly one), and
-- making the invoice from the quote stamps its number on that quote's
-- delivery notes. Both can be changed on the delivery note.
--
-- A delivery note can only point at a client PO the person can see and of the
-- same company (checked by a trigger that runs as the person, so row level
-- security applies). No new table: the existing delivery_notes policies
-- (admin / manager / sales write, viewer reads, tenant isolation) cover the
-- new columns.
--
-- Changes to existing data: none. Safe to re-run. Run after the client PO SQL.
--
-- To reverse:
--   drop trigger if exists rr_delivery_note_po_check on public.delivery_notes;
--   drop function if exists public.rr_delivery_note_po_check();
--   alter table public.delivery_notes drop column if exists client_po_id, drop column if exists invoice_ref;

set client_min_messages = warning;

do $$
begin
  if to_regclass('public.delivery_notes') is null or to_regclass('public.client_purchase_orders') is null then
    raise exception 'Run the delivery notes and client PO SQL first (delivery_notes or client_purchase_orders is missing).';
  end if;
end $$;

alter table public.delivery_notes
  add column if not exists client_po_id uuid references public.client_purchase_orders (id) on delete set null,
  add column if not exists invoice_ref text not null default '';

create index if not exists delivery_notes_client_po_idx
  on public.delivery_notes (client_po_id) where client_po_id is not null;
create index if not exists delivery_notes_invoice_ref_idx
  on public.delivery_notes (invoice_ref) where invoice_ref <> '';

comment on column public.delivery_notes.client_po_id is
  'The client PO the goods were delivered against.';
comment on column public.delivery_notes.invoice_ref is
  'The invoice number that billed this delivery (blank until invoiced).';

-- Only a PO the person can see, of the same company.
create or replace function public.rr_delivery_note_po_check()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  po_tenant uuid;
begin
  new.invoice_ref := btrim(coalesce(new.invoice_ref, ''));
  if new.client_po_id is null
     or (tg_op = 'UPDATE' and new.client_po_id is not distinct from old.client_po_id) then
    return new;
  end if;
  select p.tenant_id into po_tenant from public.client_purchase_orders p where p.id = new.client_po_id;
  if not found then
    raise exception 'That client PO is not visible to you.' using errcode = '42501';
  end if;
  if po_tenant is distinct from new.tenant_id then
    raise exception 'The client PO belongs to a different company.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists rr_delivery_note_po_check on public.delivery_notes;
create trigger rr_delivery_note_po_check before insert or update on public.delivery_notes
  for each row execute function public.rr_delivery_note_po_check();

notify pgrst, 'reload schema';
