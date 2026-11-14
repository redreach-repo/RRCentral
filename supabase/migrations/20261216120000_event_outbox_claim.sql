-- M1 event outbox: claim batch for workers (FOR UPDATE SKIP LOCKED) + stuck recovery.
-- Safe to re-run.

create or replace function public.rr_claim_event_outbox(p_limit int default 25)
returns setof public.event_outbox
language plpgsql
security definer
set search_path = public
as $$
declare
  lim int := greatest(1, least(coalesce(p_limit, 25), 100));
begin
  -- Recover rows left in processing after a worker crash (lease expired).
  update public.event_outbox
  set status = 'pending'
  where status = 'processing'
    and available_at <= now();

  return query
  with picked as (
    select e.id
    from public.event_outbox e
    where e.status = 'pending'
      and e.available_at <= now()
    order by e.available_at, e.created_at
    for update of e skip locked
    limit lim
  )
  update public.event_outbox e
  set
    status = 'processing',
    attempts = e.attempts + 1,
    -- Lease: if the worker dies, reclaim after 10 minutes.
    available_at = now() + interval '10 minutes',
    last_error = ''
  from picked
  where e.id = picked.id
  returning e.*;
end;
$$;

revoke all on function public.rr_claim_event_outbox(int) from public;
grant execute on function public.rr_claim_event_outbox(int) to service_role;

comment on function public.rr_claim_event_outbox(int) is
  'RRCRM M1: claim pending event_outbox rows for the event-outbox Edge Function.';
