-- Wave 5, PR W: the CTRM Next client issues log. Issues a CTRM Next client
-- raises go on the support desk with the channel "CTRM Next", plus four
-- fields: the vendor's ticket number, the vendor side status, when the client
-- was last sent an update, and when the vendor fixed it (set by the database).
-- The owner is the ticket's assignee. Numbers are typed in by hand: there is
-- no link to the vendor's system. The existing ticket RLS covers the new
-- columns. Safe to run more than once.

alter table public.tickets drop constraint if exists tickets_channel_check;
alter table public.tickets add constraint tickets_channel_check
  check (channel in ('email', 'whatsapp', 'phone', 'in_person', 'internal', 'web_form', 'chatbot', 'ctrm_next'));

alter table public.tickets add column if not exists vendor_ticket_ref text not null default '';
alter table public.tickets add column if not exists vendor_status text not null default '';
alter table public.tickets add column if not exists client_updated_at timestamptz;
alter table public.tickets add column if not exists vendor_fixed_at timestamptz;

alter table public.tickets drop constraint if exists tickets_vendor_status_check;
alter table public.tickets add constraint tickets_vendor_status_check
  check (vendor_status in ('', 'not_raised', 'raised', 'in_progress', 'fixed', 'waiting_for_client'));
alter table public.tickets drop constraint if exists tickets_vendor_ticket_ref_check;
alter table public.tickets add constraint tickets_vendor_ticket_ref_check check (char_length(vendor_ticket_ref) <= 60);

create index if not exists tickets_ctrm_open_idx on public.tickets (created_at)
  where channel = 'ctrm_next' and status in ('new', 'open', 'waiting_on_client');

-- vendor_fixed_at follows vendor_status: set when it becomes Fixed, cleared when it moves off Fixed.
create or replace function public.rr_ticket_vendor_fixed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.vendor_status = 'fixed' then
    if tg_op = 'INSERT' or old.vendor_status is distinct from 'fixed' then
      new.vendor_fixed_at := now();
    elsif current_user = 'authenticated' then
      new.vendor_fixed_at := old.vendor_fixed_at;
    end if;
  else
    new.vendor_fixed_at := null;
  end if;
  return new;
end $$;

drop trigger if exists rr_ticket_vendor_fixed on public.tickets;
create trigger rr_ticket_vendor_fixed before insert or update on public.tickets
  for each row execute function public.rr_ticket_vendor_fixed();

notify pgrst, 'reload schema';
