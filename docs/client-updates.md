# Weekly CTRM Next client updates

Every Thursday morning RR Central drafts a short update for every CTRM Next
client with a signed deal. Each draft says:

- **Fixed this week**: issues on the CTRM Next channel resolved, or marked
  Fixed by the vendor, since Monday.
- **Still open**: every other open issue, with the vendor status in the
  client's words (for example "raised with the CTRM Next team") and the vendor
  reference if there is one.
- **Coming up**: the next session (with the topics left to cover) and the
  deal's next step if it has a date.

A client with nothing in any of the three gets no draft that week. The drafts
wait under **Clients and partners → Weekly updates**. Nothing goes to a client
until an admin, manager or sales person checks it and taps **Send by email**
or **Send by WhatsApp**. Email goes through Zoho Mail. WhatsApp opens on your
phone or computer with the text typed in, ready to press send. Either way the
send is written on the account timeline.

**Tidy wording** asks AI to make the text read better. It may only change the
wording: if the tidied text has a date, number or reference that was not in
the draft, it is refused and your text stays as it was. The cost is logged
against the account like other AI help.

Relationship facts only: the update never holds trades, positions or prices,
and nothing is read from or sent to CTRM Next's own systems.

## Set it up

**1. Run the SQL.** Supabase → **SQL Editor**, paste the "Wave 5 Z: weekly
updates" section from the SQL copy page, **Run**.

**2. Add the secret.** Supabase → **Edge Functions** → **Secrets** → **Add new
secret**. Name `CLIENT_UPDATE_CRON_SECRET`, value: any long random text (a
password manager can make one). Keep a copy for step 4.

**3. Deploy.** GitHub → RRCentral → **Actions** → **Deploy Edge Functions** →
**Run workflow** → pick `client-updates` → **Run workflow**. Do the same for
`ai-assist` (for Tidy wording). Then open **System check** in RR Central: the
row "Weekly CTRM Next client updates to approve" should say OK.

**4. Schedule it.** Supabase → **SQL Editor**, paste the "Weekly updates
schedule" section from the SQL copy page, replace `PASTE_THE_SAME_SECRET` with
the secret from step 2, and **Run**.

```sql
select cron.unschedule('rr-client-updates')
  where exists (select 1 from cron.job where jobname = 'rr-client-updates');
select cron.schedule(
  'rr-client-updates',
  '0 4 * * 4',
  $$
  select net.http_post(
    url := 'https://pszjylxrpvlumldtptrr.supabase.co/functions/v1/client-updates',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'PASTE_THE_SAME_SECRET'),
    body := '{}'::jsonb
  );
  $$
);
```

04:00 UTC on Thursday is 08:00 in Dubai. Safe to run again (it replaces the
schedule). To stop it: `select cron.unschedule('rr-client-updates');`

## Use it

- On Thursday, open **Weekly updates**. Each client has a card with the draft.
  Edit it if needed (**Save** keeps the edit), then tap **Send by email** or
  **Send by WhatsApp**. **Show what it was built from** lists the facts.
- **Skip this week** takes a client out of the queue; **Put back in the
  queue** undoes it.
- A manager or admin can press **Build missing drafts now** at any time, for
  example after logging a fix. Clients that already have a draft for the week
  are left alone.

## Check it

- A failure appears in **App errors** under `client-updates`.
- `select * from cron.job_run_details order by start_time desc limit 5;` shows the schedule's own log.
