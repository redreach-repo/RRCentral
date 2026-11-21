-- Client POs: uniforms issued to each client employee against a PO line.
--
-- A uniform PO says e.g. "Coverall x 90, for drivers". RR Threads then hands
-- the pairs out person by person (2 pairs to each driver). This links each
-- row of the uniform issue log (client_uniform_issues) to the PO and the PO
-- line it was issued against, so the PO shows, per line:
--   ordered | issued so far | invoiced so far | left
-- and an invoice can bill exactly what was issued and not yet invoiced.
--
-- * client_uniform_issues.po_id      the client PO (cleared if the PO is deleted)
-- * client_uniform_issues.po_line_id the PO line id inside its line_items
--
-- Access is unchanged: client_uniform_issues keeps its RLS (admin / manager /
-- sales write, viewer reads, staff none, delete admin / manager only).
-- An issue can only point at a PO in its own tenant.
-- Changes no existing rows. Safe to re-run.
-- Run after client-uniform-sizes.sql and client-po-drawdowns.sql.

do $$
begin
  if to_regclass('public.client_uniform_issues') is null then
    raise exception 'Run 20261320150000_client_uniform_sizes.sql first (client_uniform_issues is missing).';
  end if;
  if to_regclass('public.client_purchase_orders') is null then
    raise exception 'Run 20261230180000_client_purchase_orders.sql first (client_purchase_orders is missing).';
  end if;
end $$;

alter table public.client_uniform_issues
  add column if not exists po_id uuid references public.client_purchase_orders (id) on delete set null;
alter table public.client_uniform_issues
  add column if not exists po_line_id text;

create index if not exists client_uniform_issues_po_idx
  on public.client_uniform_issues (po_id, po_line_id)
  where po_id is not null;

comment on column public.client_uniform_issues.po_id is
  'Client PO this issue was made against (null = issued outside a PO).';
comment on column public.client_uniform_issues.po_line_id is
  'Id of the PO line (inside client_purchase_orders.line_items) this issue counts against.';

-- The PO must be in the same tenant as the person the uniform went to.
create or replace function public.rr_uniform_issue_po_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.po_id is null then
    new.po_line_id := null;
    return new;
  end if;
  if not exists (
    select 1
    from public.client_purchase_orders p
    join public.client_uniform_staff s on s.id = new.staff_id
    where p.id = new.po_id and p.tenant_id = s.tenant_id
  ) then
    raise exception 'That client PO is not in this workspace.';
  end if;
  return new;
end $$;

revoke all on function public.rr_uniform_issue_po_check() from public;

drop trigger if exists rr_uniform_issue_po_check on public.client_uniform_issues;
create trigger rr_uniform_issue_po_check before insert or update of po_id, po_line_id, staff_id
  on public.client_uniform_issues
  for each row execute function public.rr_uniform_issue_po_check();

notify pgrst, 'reload schema';
