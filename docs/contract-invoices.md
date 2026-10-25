# Contract invoices each morning

The `contract-invoices` Edge Function raises the invoices AI CRM contracts
have come due for, every morning at 06:00 Dubai time, without anyone opening
the app:

- the setup fee, once, when a contract is saved as active;
- each month's fee (in advance) plus last month's usage over the plan (in arrears).

The rules have not changed: each one is raised as a **draft** on Invoices,
filed under division 03 RR Marketing with Net 7 days (both can be changed on
Packages and rates), and a person still opens it and finalises it to get its
RR number before sending. Only contracts with automatic invoicing turned on
are billed.

Running it twice raises nothing more. Each contract, kind and month is
claimed once in `contract_invoices`, which has a unique key on
`(contract_id, kind, period)`. The app and the schedule share that key and the
same code (`app/src/lib/contractBillingRun.ts`), so they can never both raise
the same month.

Until the schedule is running, the app keeps raising drafts when someone
signs in, as before. Once the schedule has run, the app leaves it to the
schedule, and only steps in again if the schedule has not run for 36 hours.

The 08:00 daily digest has a row "N contract invoices drafted today".

## Set it up (about 5 minutes)

**1. Add the secret.** Supabase → **Edge Functions** → **Secrets** → **Add new secret**.
Name `CONTRACT_BILLING_CRON_SECRET`, value: any long random text (a password
manager can make one). Keep a copy for step 3.

**2. Deploy.** GitHub → RRCentral → **Actions** → **Deploy Edge Functions** →
**Run workflow** → pick `contract-invoices` → **Run workflow**. Then open
**System check** in RR Central: the row "Contract invoices each morning" should say OK.

**3. Schedule it.** Supabase → **SQL Editor**, paste the "Contract invoices schedule"
section from the SQL copy page, replace `PASTE_THE_SAME_SECRET` with the secret
from step 1, and **Run**. It needs the `pg_cron` and `pg_net` extensions
(Database → Extensions), which the daily digest uses too.

```sql
select cron.unschedule('rr-contract-invoices')
  where exists (select 1 from cron.job where jobname = 'rr-contract-invoices');
select cron.schedule(
  'rr-contract-invoices',
  '0 2 * * *',
  $$
  select net.http_post(
    url := 'https://pszjylxrpvlumldtptrr.supabase.co/functions/v1/contract-invoices',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'PASTE_THE_SAME_SECRET'),
    body := '{}'::jsonb
  );
  $$
);
```

02:00 UTC is 06:00 in Dubai. Safe to run again (it replaces the schedule).
To stop it: `select cron.unschedule('rr-contract-invoices');`

## Check it

- Next morning, **Invoices** shows any new drafts, created by "RR Central daily run".
- `select key, value from app_settings where key = 'contractBillingLastRun';` shows when it last ran.
- `select * from cron.job_run_details order by start_time desc limit 5;` shows the schedule's own log.
- A failure appears in **App errors** under `contract-invoices`, and in the digest.
