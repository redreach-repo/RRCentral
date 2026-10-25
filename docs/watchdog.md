# Daily watchdog

The `watchdog` Edge Function checks RR Central every morning at 07:30 Dubai
time, before the 08:00 digest, and saves what has slipped in `watch_items`:

| Check | Rule | Owner |
| --- | --- | --- |
| Stale deals | Open CRM leads with no update for 21 days; open AI CRM sales and CTRM deals with no touch for 14 days. Days are set per pipeline on **Packages and rates → Watchdog: stale deals**. Urgent at twice the days. | The deal's owner (CRM: the login whose name matches the Owner field, else the text) |
| Invoices overdue | Sent, unpaid invoices 3, 7 or 14 days past their due date (the payment reminder stages). Urgent from 14. | The account's owner |
| Ticket reply time | Open tickets near or past their first reply time | The assignee, else the account's owner |
| Over hours | AI CRM clients more than 25% over target hours two months running | The account's owner |
| Renewals | Active contracts ending within 30 days | The account's owner |
| Contracts past their end date | Contracts still active after their end date | The account's owner |

Each item has an owner, a reason and a link. An item found again keeps its row.
An item not found any more is cleared, so fixing the cause (a touch on the
deal, a payment recorded, a reply sent, the contract renewed) clears it the
next morning. Rules and tests: `app/src/lib/watchdog.ts` (bundled into the function).

Where it shows:

- **Dashboard → Watchdog**: your items and the unowned ones, with **Show everyone's**.
  Staff logins only ever see their own items.
- **08:00 digest**: "Invoices 3, 7 or 14 days late" and "Deals nobody has touched".
  Tickets, renewals and hours are already in the digest.

## Set it up (about 5 minutes)

**1. Run the SQL.** Copy the "Watchdog" section from the SQL copy page
(`supabase/migrations/20261112090000_watch_items.sql`) into Supabase → **SQL Editor** → **Run**.
Safe to run again.

**2. Add the secret.** Supabase → **Edge Functions** → **Secrets** → **Add new secret**.
Name `WATCHDOG_CRON_SECRET`, value: any long random text. Keep a copy for step 4.

**3. Deploy.** GitHub → RRCentral → **Actions** → **Deploy Edge Functions** → **Run workflow** →
pick `watchdog` → **Run workflow**. Do the same for `daily-digest`, so the digest shows the new rows.
Then **System check**: "Daily watchdog list" should say OK.

**4. Schedule it.** Supabase → **SQL Editor**, paste the "Watchdog schedule" section from the copy page,
replace `PASTE_THE_SAME_SECRET` with the secret from step 2, and **Run**.

```sql
select cron.unschedule('rr-watchdog')
  where exists (select 1 from cron.job where jobname = 'rr-watchdog');
select cron.schedule(
  'rr-watchdog',
  '30 3 * * *',
  $$
  select net.http_post(
    url := 'https://pszjylxrpvlumldtptrr.supabase.co/functions/v1/watchdog',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'PASTE_THE_SAME_SECRET'),
    body := '{}'::jsonb
  );
  $$
);
```

03:30 UTC is 07:30 in Dubai. To stop it: `select cron.unschedule('rr-watchdog');`
