begin;

-- RR Central roadmap item 8: WhatsApp to tickets.
--
-- Client messages to the WhatsApp Business number arrive through the
-- whatsapp-in Edge Function and open or continue a ticket. Replies typed on
-- the ticket go out through the whatsapp-send Edge Function.
--
-- 1. tickets.requester_phone: the WhatsApp number a ticket came from
--    (digits with country code), so replies know where to go and a known
--    number's next message joins its open ticket.
-- 2. ticket_messages.delivery_status: sent, delivered, read or failed, for
--    replies sent on WhatsApp (empty for everything else).
-- 3. One row per WhatsApp message id, so a message Meta delivers twice is
--    only saved once.
--
-- Changes no existing data. Safe to re-run.
--
-- To reverse:
--   drop index if exists public.ticket_messages_wamid_unique;
--   drop index if exists public.tickets_requester_phone_idx;
--   alter table public.ticket_messages drop column if exists delivery_status;
--   alter table public.tickets drop column if exists requester_phone;

alter table public.tickets
  add column if not exists requester_phone text not null default '';
create index if not exists tickets_requester_phone_idx
  on public.tickets (requester_phone) where requester_phone <> '';

alter table public.ticket_messages
  add column if not exists delivery_status text not null default '';
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ticket_messages_delivery_status_check'
  ) then
    alter table public.ticket_messages add constraint ticket_messages_delivery_status_check
      check (delivery_status in ('', 'sent', 'delivered', 'read', 'failed'));
  end if;
end $$;

create unique index if not exists ticket_messages_wamid_unique
  on public.ticket_messages (external_id) where external_id like 'wamid.%';

notify pgrst, 'reload schema';

commit;
