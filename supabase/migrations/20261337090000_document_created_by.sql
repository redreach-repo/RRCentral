-- Who made each quote, invoice, delivery note and client PO, so admins and
-- managers can see everything Sales made on Home ("Made by Sales" card).
--
-- * client_purchase_orders gets created_by (it had none). Old POs stay blank.
-- * On every new quotation, invoice, delivery note and client PO, created_by is
--   the signed-in person's email, whatever the browser sent. Rows written by the
--   server with no signed-in person keep what they were given.
-- * created_by never changes afterwards, so nobody can pass a document off as
--   someone else's.
--
-- No new table and no change to who can read what. Safe to re-run.
-- Needs 20261230180000_client_purchase_orders.sql.
--
-- To reverse:
--   drop trigger if exists rr_document_created_by on public.quotations;  (and the other three)
--   drop function if exists public.rr_document_created_by_stamp();

alter table public.client_purchase_orders add column if not exists created_by text not null default '';

create or replace function public.rr_document_created_by_stamp()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me text := public.rr_current_email();
begin
  if tg_op = 'INSERT' then
    if coalesce(me, '') <> '' then
      new.created_by := me;
    else
      new.created_by := coalesce(new.created_by, '');
    end if;
  elsif new.created_by is distinct from old.created_by then
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

revoke all on function public.rr_document_created_by_stamp() from public;

do $$
declare
  t text;
begin
  foreach t in array array['quotations', 'invoices', 'delivery_notes', 'client_purchase_orders'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'table % missing, skipping', t;
      continue;
    end if;
    execute format('drop trigger if exists rr_document_created_by on public.%I', t);
    execute format(
      'create trigger rr_document_created_by before insert or update on public.%I
         for each row execute function public.rr_document_created_by_stamp()', t);
  end loop;
end $$;

-- Home card: newest documents first.
create index if not exists quotations_created_at_idx on public.quotations (created_at desc);
create index if not exists invoices_created_at_idx on public.invoices (created_at desc);
create index if not exists delivery_notes_created_at_idx on public.delivery_notes (created_at desc);
create index if not exists client_purchase_orders_created_at_idx on public.client_purchase_orders (created_at desc);

notify pgrst, 'reload schema';
