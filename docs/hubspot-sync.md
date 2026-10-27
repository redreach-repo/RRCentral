# HubSpot sync

The `hubspot-sync` Edge Function sends RR Central to HubSpot, one way. RR
Central stays the master: nothing typed in HubSpot comes back, and deleting a
row in RR Central leaves its HubSpot record alone.

| RR Central | HubSpot | Notes |
| --- | --- | --- |
| Accounts (AI CRM clients, WorshipHub churches, CTRM Next) | Companies | Name, website and domain, city, country. Type, reference, status and industry go in the description. An account whose website domain is already a HubSpot company is linked to it, not doubled. |
| Account contacts | Contacts, linked to the company | Matched by email, so the same person on two accounts is one contact. Phone, WhatsApp (as mobile), role (as job title). |
| AI CRM deals (Sales pipeline) | Deals in the default Sales Pipeline, linked to the company | Lead → Appointment Scheduled, Discovery call → Qualified To Buy, Quote sent → Contract Sent, Signed → Closed Won, Lost → Closed Lost. Amount is the first year value (setup fee plus 12 months less discount months), converted from AED to USD at the 3.6725 peg because the HubSpot account's currency is USD. The AED value is in the description. |

Each run sends only rows that changed since the last run
(`hubspot_links.synced_hash`). A run stops starting new rows after about 100
seconds and the next run carries on, so a big first sync can take two or three
presses. Rules and tests: `supabase/functions/_shared/hubspot.ts`,
`supabase/functions/_shared/hubspotSync.ts`,
`supabase/tests/functions/hubspot_test.ts`.

## 1. Run the SQL

Run the "HubSpot sync" section from the SQL copy page (it is
`supabase/migrations/20261202090000_hubspot_sync.sql`). Safe to run twice.

## 2. Make a HubSpot private app

In HubSpot: Settings (gear) → Integrations → Private Apps → Create a private
app (on newer accounts: Development → Legacy apps → Create → Private). Name it
"RR Central". Under Scopes add:

* `crm.objects.companies.read` and `crm.objects.companies.write`
* `crm.objects.contacts.read` and `crm.objects.contacts.write`
* `crm.objects.deals.read` and `crm.objects.deals.write`

Create the app and copy its access token (starts `pat-`). Never paste it in a
chat or a ticket.

## 3. Add the secrets

In Supabase: Edge Functions → Secrets:

| Secret | What it is |
| --- | --- |
| `HUBSPOT_ACCESS_TOKEN` | The private app token from step 2 |
| `HUBSPOT_CRON_SECRET` | Any long random string, used only by the nightly schedule |

## 4. Deploy

GitHub → RRCentral → **Actions** → **Deploy Edge Functions** → **Run workflow** →
pick `hubspot-sync` → **Run workflow**. Verify JWT is off for it in
`supabase/config.toml`; the function checks the caller itself (a signed in
manager or admin, or the schedule's secret header).

Then open **Settings → HubSpot** and press **Sync now**.

## 5. Run it nightly

In the Supabase SQL editor, once (needs `pg_cron` and `pg_net`, under Database
→ Extensions). Replace the secret:

```sql
select cron.schedule(
  'rr-hubspot-sync-nightly',
  '30 22 * * *',
  $$
  select net.http_post(
    url := 'https://pszjylxrpvlumldtptrr.supabase.co/functions/v1/hubspot-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'PASTE_THE_SAME_SECRET'),
    body := '{}'::jsonb
  );
  $$
);
```

That runs at 22:30 UTC (02:30 in Dubai). To stop it:
`select cron.unschedule('rr-hubspot-sync-nightly');`

## Checking it

Settings → HubSpot shows the last run: what was sent, what failed and why.
System check lists `hubspot-sync` and says when a secret is missing.

## Who can do what

Managers and admins can run the sync and read the run log and links. Sales,
the VA (staff), viewers and anyone outside the team cannot see either, and
nobody in the app can change them; only the function (service role) writes.
