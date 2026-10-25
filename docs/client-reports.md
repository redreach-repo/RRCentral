# Monthly client reports

On the 1st of each month RR Central drafts a report for every AI CRM client
with an active contract, covering the month just ended. Each draft has the
report numbers (hours, support, usage against plan, build progress, what comes
next) and a summary written by AI from those numbers. The drafts wait under
**Clients and partners → Monthly reports**. Nothing goes to a client until an
admin, manager or sales person checks the summary and presses **Approve and
send**. That emails the report (Zoho Mail) and sends it on WhatsApp (a Meta
template) to the account's primary contact, and writes a line on the account
timeline.

The AI cost of each draft is logged against the account, the same as AI help.

## Set it up

**1. Run the SQL.** Supabase → **SQL Editor**, paste the "Wave 4 Q: monthly
reports" section from the SQL copy page, **Run**.

**2. Add the secret.** Supabase → **Edge Functions** → **Secrets** → **Add new
secret**. Name `CLIENT_REPORT_CRON_SECRET`, value: any long random text (a
password manager can make one). Keep a copy for step 4. AI drafts also need
`ANTHROPIC_API_KEY` (the same one AI help uses). Without it the drafts still
appear, with an empty summary to write by hand.

**3. Deploy.** GitHub → RRCentral → **Actions** → **Deploy Edge Functions** →
**Run workflow** → pick `client-reports` → **Run workflow**. Then open **System
check** in RR Central: the row "Monthly client reports to approve" should say OK.

**4. Schedule it.** Supabase → **SQL Editor**, paste the "Monthly reports
schedule" section from the SQL copy page, replace `PASTE_THE_SAME_SECRET` with
the secret from step 2, and **Run**.

```sql
select cron.unschedule('rr-client-reports')
  where exists (select 1 from cron.job where jobname = 'rr-client-reports');
select cron.schedule(
  'rr-client-reports',
  '0 3 1 * *',
  $$
  select net.http_post(
    url := 'https://pszjylxrpvlumldtptrr.supabase.co/functions/v1/client-reports',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'PASTE_THE_SAME_SECRET'),
    body := '{}'::jsonb
  );
  $$
);
```

03:00 UTC on the 1st is 07:00 in Dubai. Safe to run again (it replaces the
schedule). To stop it: `select cron.unschedule('rr-client-reports');`

**5. WhatsApp (optional).** Email works as soon as Zoho Mail is connected. For
WhatsApp, the same `WHATSAPP_PHONE_NUMBER_ID` and `META_ACCESS_TOKEN` secrets
as the digest are needed, plus an approved Meta template named
`rr_monthly_report` (category Utility, language English) with three values:

> Hi {{1}}, here is your {{2}} summary from Red Reach: {{3}} The full report is in your client portal.

A different template name or language can be set with the secrets
`CLIENT_REPORT_WHATSAPP_TEMPLATE` and `CLIENT_REPORT_WHATSAPP_LANGUAGE`.

## Use it

- On the 1st, open **Monthly reports**. Each client has a card with the AI
  summary. Edit it if needed (Save summary keeps the edit), then press
  **Approve and send**. Email only and WhatsApp only are there too.
- **Skip this month** takes a client out of the queue; **Put back in the
  queue** undoes it.
- A manager or admin can press **Build missing drafts now** at any time, for
  example after adding a new client. Clients that already have a draft for the
  month are left alone.

## Check it

- A failure appears in **App errors** under `client-reports`.
- `select * from cron.job_run_details order by start_time desc limit 5;` shows the schedule's own log.
