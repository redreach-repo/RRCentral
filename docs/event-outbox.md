# Event outbox worker

The `event-outbox` Edge Function drains `event_outbox` (filled by
`enqueueDomainEvent` / `logActivity`): claim a batch, run handlers, mark done,
retry with exponential backoff, or dead-letter after 8 attempts.

Pure rules: `app/src/lib/eventOutboxWorker.ts`. Claim RPC:
`rr_claim_event_outbox` in `supabase/migrations/20261216120000_event_outbox_claim.sql`
(FOR UPDATE SKIP LOCKED + 10-minute lease recovery).

Handlers today acknowledge activity-mirrored events so the queue drains.
Domain side effects (digest nudges, webhooks, HubSpot) plug into
`dispatchDomainEvent` later.

## Set it up

**1. Run the SQL.** Apply `supabase/migrations/20261216120000_event_outbox_claim.sql`
in Supabase → **SQL Editor** (or your usual migration path). Safe to run again.

**2. Secret.** Edge Functions → **Secrets** → `OUTBOX_CRON_SECRET` = long random text.

**3. Deploy.** Actions → **Deploy Edge Functions** → pick `event-outbox`.
**System check** should list “Domain event outbox worker”.

**4. Schedule** (every 5 minutes):

```sql
select cron.unschedule('rr-event-outbox')
  where exists (select 1 from cron.job where jobname = 'rr-event-outbox');
select cron.schedule(
  'rr-event-outbox',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://pszjylxrpvlumldtptrr.supabase.co/functions/v1/event-outbox',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'PASTE_THE_SAME_SECRET'),
    body := '{"limit": 25}'::jsonb
  );
  $$
);
```

Managers/admins can also POST with their JWT (empty body or `{ "limit": 50 }`).

## Statuses

| status | meaning |
| --- | --- |
| pending | waiting (`available_at` for backoff) |
| processing | claimed; reverts to pending if lease expires |
| done | handled |
| failed | dead-letter after max attempts or non-retryable error |
