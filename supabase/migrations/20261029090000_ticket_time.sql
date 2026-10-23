-- RR Central roadmap item 1: time logged with a ticket reply.
--
-- Hours logged from the "Log time" box on a ticket reply keep a link to the
-- ticket, so the ticket can show how much time it took. The column is
-- optional and changes no existing rows. The existing time_entries policies
-- (log your own hours on accounts you can edit) still apply.
-- Safe to re-run.
--
-- To reverse:
--   drop index if exists public.idx_time_entries_ticket;
--   alter table public.time_entries drop column if exists ticket_id;

alter table public.time_entries
  add column if not exists ticket_id uuid references public.tickets(id) on delete set null;

create index if not exists idx_time_entries_ticket on public.time_entries (ticket_id)
  where ticket_id is not null;
