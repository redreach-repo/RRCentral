begin;

-- WorshipHub support tickets: tickets raised on worship-hub.com through its
-- /support form or its "Need help?" chat widget keep that channel, instead
-- of showing as email. support-email-in sets them (see its README).
-- Changes no existing data. Safe to re-run.
--
-- To reverse (only once no ticket uses the new channels):
--   alter table public.tickets drop constraint if exists tickets_channel_check;
--   alter table public.tickets add constraint tickets_channel_check
--     check (channel in ('email', 'whatsapp', 'phone', 'in_person', 'internal'));

alter table public.tickets drop constraint if exists tickets_channel_check;
alter table public.tickets add constraint tickets_channel_check
  check (channel in ('email', 'whatsapp', 'phone', 'in_person', 'internal', 'web_form', 'chatbot'));

commit;
