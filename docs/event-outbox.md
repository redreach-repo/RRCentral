# Event outbox worker

The `event-outbox` Edge Function drains `event_outbox` (filled by
`enqueueDomainEvent` / `logActivity`): claim a batch, run domain handlers,
mark done, retry with exponential backoff, or dead-letter after 8 attempts.

Pure classification: `app/src/lib/eventOutboxWorker.ts`. Claim RPC:
`rr_claim_event_outbox` in `supabase/migrations/20261216120000_event_outbox_claim.sql`
(FOR UPDATE SKIP LOCKED + 10-minute lease recovery).

## Domain handlers

| Effect | When | What it does |
| --- | --- | --- |
| **HubSpot nudge** | CRM / quote / invoice / deal activity | Sets `app_settings.hubspot_sync_requested_at`. If `HUBSPOT_CRON_SECRET` is set, also POSTs `hubspot-sync` once per batch. `hubspot-sync` clears the setting when a run finishes; optional cron body `{ "only_if_requested": true }` polls only when a nudge is waiting. |
| **Digest signal** | Quotes finalized, payments, follow-ups, calls, DNs | Writes `app_settings.digest_attention_signal` JSON (`{ at, events[] }`). The morning digest (`dailyDigest.parseDigestAttentionSignal`) surfaces it as “Recent CRM activity”, then clears the setting after send. |
| **Webhook** | Every event, when configured | POSTs the event JSON to `app_settings.outbound_webhook_url`. Failures retry the outbox row. |

Unknown activity types still drain (webhook only if configured, otherwise ack).

## Set it up

**1. Run the SQL.** Apply `supabase/migrations/20261216120000_event_outbox_claim.sql`
in Supabase → **SQL Editor** (or your usual migration path). Safe to run again.

**2. Secret.** Edge Functions → **Secrets** → `OUTBOX_CRON_SECRET` = long random text.
Optional: `HUBSPOT_CRON_SECRET` (same value as HubSpot sync) so the worker can invoke HubSpot immediately.

**3. Optional webhook.** Settings / SQL:

```sql
insert into public.app_settings (key, value)
values ('outbound_webhook_url', 'https://example.com/hooks/rrcentral')
on conflict (key) do update set value = excluded.value;
```

**4. Deploy.** Actions → **Deploy Edge Functions** → pick `event-outbox`.
**System check** should list “Domain event outbox worker” (live test 33) and show an
**Outbox** card with pending / processing / failed counts plus any HubSpot or digest
nudge still waiting.

**5. Schedule** (every 5 minutes):

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
