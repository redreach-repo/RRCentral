# Daily digest

The `daily-digest` Edge Function sends a short morning list of what needs
attention in RR Central to the people on the digest list:

| List | Rule (same as the dashboard) |
| --- | --- |
| Tickets near or past their reply time | Open tickets whose SLA is breached or in its last stretch (`sla.ts`) |
| Renewals in the next 60 days | Active AI CRM contracts ending within 60 days, or already ended (`renewalFlag`) |
| Overdue CTRM next actions | Open CTRM Next deals whose next action date has passed |
| Clients over their hours | AI CRM clients more than 25% over target hours two months running (`hoursAlert`) |
| Fridays only: no hours this week | Clients on a running contract with no hours logged since Monday |

Email has the full list with links. WhatsApp has the counts (Meta does not
allow line breaks in template values). Rules and tests:
`app/src/lib/dailyDigest.ts` (bundled into the function).

The schedule sends at most one digest a day and skips a day with nothing to
report. **Send now** on Packages and rates always sends.

## 1. Add people to the list

On **Packages and rates**, under Daily digest (managers and admins), add each
person with their email, WhatsApp number (digits with country code, for
example `971501234567`), or both. The card also shows a preview of today's
digest.

## 2. Email

Email goes through the Zoho Mail connection already saved in Settings
(Client ID, Client Secret, Refresh Token, and Mail set to yes). Nothing else
to add. It is sent from the Zoho Mail account the app already uses.

## 3. WhatsApp (optional)

WhatsApp needs an approved message template, because the digest starts the
conversation.

1. In Meta Business Suite, WhatsApp Manager, Message templates, create a
   template named `rr_daily_digest`, category Utility, language English
   (`en`), with this body:

   ```
   RR Central digest for {{1}}. Tickets near or past reply time: {{2}}. Renewals in the next 60 days: {{3}}. Overdue CTRM next actions: {{4}}. Clients over hours: {{5}}. Details are in your email and on the dashboard.
   ```

   Example values for the review: `Monday 2 November`, `2`, `1`, `3`, `0`.
2. Wait for Meta to approve it.
3. Add the secrets below.

## 4. Secrets

In Supabase: Edge Functions, Secrets (or `npx supabase secrets set NAME=value`):

| Secret | What it is |
| --- | --- |
| `DIGEST_CRON_SECRET` | Any long random string, used only by the daily schedule |
| `WHATSAPP_PHONE_NUMBER_ID` | The phone number ID that sends the digest (WhatsApp Manager, Phone numbers, or API setup) |
| `META_ACCESS_TOKEN` | Same token as the usage import, with `whatsapp_business_messaging` permission too |
| `META_GRAPH_VERSION` | Optional, defaults to `v21.0` |
| `DIGEST_WHATSAPP_TEMPLATE` | Optional, defaults to `rr_daily_digest` |
| `DIGEST_WHATSAPP_LANGUAGE` | Optional, defaults to `en` |
| `APP_URL` | Optional, defaults to `https://redreach-repo.github.io/RRCentral` (used for links in the email) |

Without the WhatsApp secrets, WhatsApp is skipped and email still goes.

## 5. Deploy

GitHub → RRCentral → **Actions** → **Deploy Edge Functions** → **Run workflow** → pick `daily-digest` → **Run workflow**.
Verify JWT is off for it in `supabase/config.toml`; the function checks the caller itself.

The function checks the caller itself: a signed in manager or admin, or the
schedule's secret header. Then press **Send now** on Packages and rates.

## 6. Run it every morning

In the Supabase SQL editor, once (needs the `pg_cron` and `pg_net`
extensions, under Database, Extensions). Replace the secret:

```sql
select cron.schedule(
  'rr-daily-digest',
  '0 4 * * *',
  $$
  select net.http_post(
    url := 'https://pszjylxrpvlumldtptrr.supabase.co/functions/v1/daily-digest',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'PASTE_THE_SAME_SECRET'),
    body := '{}'::jsonb
  );
  $$
);
```

That runs at 04:00 UTC (08:00 in Dubai), after the usage import at 02:00. To
stop it: `select cron.unschedule('rr-daily-digest');`

## Checking it

Packages and rates shows the last digest: when it went, whether email and
WhatsApp were sent, and any error.
