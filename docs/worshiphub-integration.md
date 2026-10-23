# WorshipHub read only integration

RR Central shows each WorshipHub church's plan, modules, WhatsApp usage,
billing status and renewal date on the Products page and on the church's
account page. It reads these live from WorshipHub and never stores them.

RR Central never receives member, visitor, registration or giving data. The
field list below is the whole contract. The `worshiphub-read` Edge Function
drops anything else WorshipHub sends, using `app/src/lib/worshiphub.ts`.

When WorshipHub is not connected, the pages say so and show the details
entered by hand on each church (stored in `worship_church_profiles`).

## Fields

One row per tenant, account level only.

| Field | Type | Example | Notes |
| --- | --- | --- | --- |
| `slug` | text | `icoc-uae` | Lowercase letters, numbers and hyphens. Required. |
| `name` | text | `ICOC UAE` | Church name. |
| `plan` | text | `Standard` | Plan name as WorshipHub shows it. |
| `modules` | text array | `["events", "giving"]` | Modules turned on. Names only. |
| `whatsapp_month` | text | `2026-10` | Month the counts below are for, `YYYY-MM`. Use the current month. |
| `whatsapp_marketing` | integer | `120` | Marketing conversations that month. |
| `whatsapp_service` | integer | `45` | Service conversations that month. |
| `whatsapp_utility` | integer | `3` | Utility conversations that month. |
| `billing_status` | text | `active` | One of `trial`, `active`, `past_due`, `paused`, `cancelled`. |
| `renewal_date` | date | `2027-01-15` | `YYYY-MM-DD`. |
| `admin_url` | text | `https://…/admin/icoc-uae` | WorshipHub admin page for this church. Must be https. |

Anything that does not match is blanked, not trusted: an unknown billing
status shows as "Not set", a bad date as no date, a negative count as 0.

## What WorshipHub needs to provide

A read only HTTPS endpoint that answers `GET` with JSON, either
`{ "tenants": [ ... ] }` or a bare array of rows with the fields above.
It must check a bearer token that is used for nothing else:

```
GET <WORSHIPHUB_API_URL>
Authorization: Bearer <WORSHIPHUB_API_TOKEN>
```

Two ways to build it:

1. **An API route in WorshipHub** that selects only these fields per tenant
   and checks the token. This is the cleanest option.
2. **A database view** if WorshipHub runs on Supabase. Create a view with
   exactly these columns (for example `rr_central_tenants`), a Postgres role
   that can only `select` from that view, and a JWT for that role. Then set
   `WORSHIPHUB_API_URL` to `https://<worshiphub-project>.supabase.co/rest/v1/rr_central_tenants?select=*`,
   `WORSHIPHUB_API_TOKEN` to that JWT and `WORSHIPHUB_API_KEY` to the
   WorshipHub anon key. Do not use a WorshipHub service role key.

## Setting it up in RR Central

1. Deploy the function, with both files in `supabase/functions/worshiphub-read`
   (`index.ts` and `worshiphub.bundle.js`), Verify JWT on:

   ```bash
   npx supabase functions deploy worshiphub-read
   ```

2. Store the connection as function secrets (never in the app or the repo):

   ```bash
   npx supabase secrets set WORSHIPHUB_API_URL=https://... WORSHIPHUB_API_TOKEN=...
   # only for option 2 above:
   npx supabase secrets set WORSHIPHUB_API_KEY=...
   ```

3. Make sure each tenant has a church account with its slug. In the SQL editor:

   ```sql
   -- Dry run: shows what it would do, changes nothing.
   select * from rr_add_worshiphub_churches();
   -- Apply. Keep the batch_id to undo.
   select * from rr_add_worshiphub_churches(p_dry_run => false);
   -- Undo one apply.
   select rr_undo_worshiphub_churches('<batch_id>');
   ```

   It matches an existing church account by slug or by name (ICOC UAE matches
   `icoc-uae`), and creates the account only when there is none. Once
   connected, admins and managers also see any other tenant on the Products
   page with an "Add as church account" button.

## Who sees what

* The function only answers signed in RR Central users.
* Staff only get the churches assigned to them. Admins and managers also get
  tenants that have no church account yet.
* Viewers can read church details but not edit them.
