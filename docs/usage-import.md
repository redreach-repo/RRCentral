# Usage import

The `usage-import` Edge Function fills each AI CRM client's monthly usage
(`usage_records`) so nobody has to type it in:

| Number | Source | How it is matched to a client |
| --- | --- | --- |
| WhatsApp marketing messages | Meta `pricing_analytics` on your WhatsApp Business Account, category MARKETING | The client's WhatsApp phone numbers |
| WhatsApp service and utility messages | Same, every other category (utility, authentication, service) | Same |
| AI spend (USD) | Anthropic Admin API cost report, grouped by workspace | The client's Anthropic workspace ID |
| Lead credits | Not imported | Stays manual |

Each run covers this month so far, and last month as well during the first 3
days of a month (while Meta and Anthropic finish reporting it). A month that
someone typed in or changed by hand is left alone. Rules and tests:
`app/src/lib/usageImport.ts` (bundled into the function).

Meta counts delivered messages (per message pricing since July 2025). The
package's "included WhatsApp" number is compared against these counts.

## 1. Link each client

On the client page, under Usage, press **Links** (managers and admins) and enter:

* the client's WhatsApp number(s), digits with country code, for example `971501234567`
* the client's Anthropic workspace ID (`wrkspc_...`), if their AI runs in its own workspace

## 2. Add the secrets

In Supabase: Edge Functions, Secrets (or `npx supabase secrets set NAME=value`):

| Secret | What it is |
| --- | --- |
| `META_WABA_ID` | WhatsApp Business Account ID (Meta Business Suite, WhatsApp accounts) |
| `META_ACCESS_TOKEN` | A system user token with `whatsapp_business_management` permission |
| `META_GRAPH_VERSION` | Optional, defaults to `v21.0` |
| `ANTHROPIC_ADMIN_KEY` | An Anthropic Admin API key (`sk-ant-admin...`, Console, Settings, Admin keys) |
| `USAGE_IMPORT_CRON_SECRET` | Any long random string, used only by the daily schedule |

A source with no secrets is skipped, so WhatsApp and AI can be set up one at a time.

## 3. Deploy

GitHub → RRCentral → **Actions** → **Deploy Edge Functions** → **Run workflow** → pick `usage-import` → **Run workflow**.
Verify JWT is off for it in `supabase/config.toml`; the function checks the caller itself.

The function checks the caller itself: a signed in manager or admin, or the
schedule's secret header. Then press **Import now** on Packages and rates.

## 4. Run it daily

In the Supabase SQL editor, once (needs the `pg_cron` and `pg_net`
extensions, both available on Supabase under Database, Extensions). Replace
the project URL and the secret:

```sql
select cron.schedule(
  'rr-usage-import-daily',
  '0 2 * * *',
  $$
  select net.http_post(
    url := 'https://pszjylxrpvlumldtptrr.supabase.co/functions/v1/usage-import',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'PASTE_THE_SAME_SECRET'),
    body := '{}'::jsonb
  );
  $$
);
```

That runs at 02:00 UTC (06:00 in Dubai). To stop it:
`select cron.unschedule('rr-usage-import-daily');`

## Checking it

Packages and rates shows the last run: what was imported, what failed and why.
Each client's Usage card says whether the month was imported or typed in.
