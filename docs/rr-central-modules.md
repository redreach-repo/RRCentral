# RR Central modules

How the account based modules work: accounts, client delivery, the support
desk, the CTRM Next pipeline and the WorshipHub products section. They were
added in October 2026 on top of the existing CRM, quotations, invoices and
finance, which keep working as before.

The app is a Vite and React SPA in `app/` on GitHub Pages, backed by Supabase
Postgres with Row Level Security. Migrations live in `supabase/migrations` and
are run by hand in the Supabase SQL editor. Every table below also exists in
local mode (IndexedDB, `app/src/lib/localDb.ts`) and in the backup export
(`app/src/lib/centralBackup.ts`).

## Data model

### Accounts (phase 1, `20261023090000_accounts_foundation.sql`)

| Table | What it holds |
| --- | --- |
| `accounts` | Every organisation Red Reach works with. `type` is `ai_crm_client`, `worship_church` or `ctrm_prospect`. `reference` is `AC-[code]-[YY][seq]` (07 AI CRM, 08 WorshipHub, 09 CTRM). `owner_user_id` decides what staff can see. |
| `account_contacts` | People at an account. One can be primary. |
| `account_activities` | The shared timeline: notes, calls, emails, meetings and system events (stage moves, tickets, contract changes). |

`clients`, `quotations` and `invoices` have a nullable `account_id`.
Invoice and quotation numbers (`RR-…`) never change. Link existing rows with
`supabase/scripts/link-accounts.sql` (dry run first, undo by batch), or one by
one from the account page.

### Client delivery (phase 2, `20261024090000_client_delivery.sql`)

| Table | What it holds |
| --- | --- |
| `delivery_packages` | The package catalogue (Starter, Growth, Done for you): prices for option A and B, target hours, build hours, included WhatsApp conversations, support response, AI cap, lead credits, tool cost estimate. |
| `contracts` | One per client term: package, option, fees, setup fee paid, 12 month term, discount, annual prepay, status. |
| `build_stages` | Discovery, requirements signed off, build, WhatsApp setup, testing, live. |
| `requirements` | What the client asked for. Changes after sign off are change requests. |
| `time_entries` | Hours by person, date and category. |
| `usage_records` | Per month: WhatsApp marketing and service counts, AI cost and lead credit cost in USD. |

Rules live in `app/src/lib/delivery.ts` with tests: hours alert (more than 25%
over target two months running), overage, renewal flag (60 days), early exit
fee, profitability.

### Support desk (phase 3, `20261025090000_support_desk.sql`)

| Table | What it holds |
| --- | --- |
| `tickets` | Subject, channel, priority, status, assignee, `sla_due_at`, first response and resolved times. A ticket with no account is an unknown sender. |
| `ticket_messages` | Replies, client messages and internal notes. Replies also go on the account timeline. |
| `sla_policies` | First response time in working hours, per package or per account type. |

Working time is in `app/src/lib/sla.ts` (9 hour days, Dubai time, Monday to
Friday by default). The same file is bundled into the `support-email-in` Edge
Function, which turns email into tickets (see its README).

### CTRM Next pipeline (phase 4, `20261026090000_ctrm_pipeline.sql`)

| Table | What it holds |
| --- | --- |
| `ctrm_deals` | One per prospect: stage, region, company type, contact, source, owner, last touch, next action and date, lost reason, notes. The database refuses a lost deal without a reason and an open deal without a next action and date. |
| `ctrm_deal_stage_changes` | Every stage move, insert only. Feeds the weekly summary. |
| `ctrm_deal_commissions` | Commission expected and received by Red Reach. A separate table so staff and viewers never get it. |

The weekly summary (`/ctrm/summary`, Monday to Sunday) never loads commission.

### WorshipHub products (phase 5, `20261027090000_worshiphub_products.sql`)

| Table | What it holds |
| --- | --- |
| `worship_church_profiles` | Per church account: WorshipHub slug, plan, modules, WhatsApp count for a month, billing status, renewal date, admin link. Entered by hand, used when WorshipHub is not connected. |

Live values come from the `worshiphub-read` Edge Function. Field spec and
setup: `docs/worshiphub-integration.md`. No member or visitor data is copied.

### Dashboard (phase 6, `20261028090000_dashboard_costs.sql`)

Adds the `deliveryFixedMonthlyCostAed` setting. The dashboard shows clients
over hours or near renewal, tickets near or past their reply time, overdue and
stale CTRM deals, churches with billing problems or renewals in 60 days, and
this month's revenue against costs (`app/src/lib/attention.ts`).

### Time logging (roadmap item 1, `20261029090000_ticket_time.sql`)

Adds an optional `time_entries.ticket_id`. Three ways to keep hours honest,
all in `app/src/lib/timeTracking.ts` with tests:

- **Timer on the client page.** Start it, stop it, and the hours log
  themselves, rounded to the nearest quarter hour (15 minutes at least). One
  timer per person, kept in the browser so it survives a reload; the top bar
  shows it while it runs. A timer left on for more than 10 hours is not
  logged; the person enters the real hours instead.
- **Log time on a ticket reply.** Pick 15 minutes to 3 hours next to the reply.
  It goes on the client's hours as support and is linked to the ticket.
- **Friday check.** From Friday to Sunday the dashboard lists AI CRM clients on
  a running contract with no hours since Monday, and people who allowed
  desktop reminders get one notification a week with the same list.

### Contract invoicing (roadmap item 2, `20261030090000_contract_billing.sql`)

Adds `contracts.auto_invoice` (off for existing contracts) and
`contracts.billing_from`, plus `contract_invoices` (one row per contract,
kind and month, so nothing is raised twice) and `invoice_reminders`. Logic is
in `app/src/lib/contractBilling.ts` and `contractBillingStore.ts`, with tests.

- **Setup fee** is raised when a contract with automatic invoicing is saved as
  active, for any unpaid part. Switching it on for a running contract skips
  the setup fee and starts monthly invoices next month.
- **Monthly invoice** carries that month's fee (in advance, with any discount
  month used up) and the previous month's WhatsApp, AI and lead credit use
  over the plan. After the term ends, one last invoice bills the final
  month's usage. Contracts paid yearly get usage lines only.
- Everything is raised as a **draft** on Invoices. While a draft is unedited it
  follows usage entered later. Finalising it gives it its RR reference.
- There is no server job: the run happens in the browser whenever an admin,
  manager or sales user opens the app (and on saving a contract).
- **Payment reminders** show on Invoices and the dashboard 3, 7 and 14 days
  after the due date (invoice date plus "Net N days"), with the message ready
  to send by email (Zoho Mail when connected) or WhatsApp.
- Division and payment terms for these invoices are on Packages and rates
  (default 03 RR Marketing, Net 7 days).

### Usage import (roadmap item 3, `20261031090000_usage_import.sql`)

Adds `usage_sources` (per client WhatsApp numbers and Anthropic workspace),
`usage_records.imported_at` and `usage_import_runs`. The `usage-import` Edge
Function pulls WhatsApp counts from Meta and AI spend from Anthropic. Setup,
secrets and the daily schedule: [usage-import.md](usage-import.md).

### Daily digest (roadmap item 4, `20261101090000_daily_digest.sql`)

Adds `digest_recipients` (who gets the digest, by email and/or WhatsApp) and
`digest_runs`. The `daily-digest` Edge Function sends tickets near breach,
renewals in 60 days, overdue CTRM next actions and clients over hours each
morning. Setup, WhatsApp template and schedule: [daily-digest.md](daily-digest.md).

### Pre-sale pipeline (roadmap item 5, `20261102090000_sales_pipeline.sql`)

Adds `sales_deals`: AI CRM prospects moving Lead, Discovery call, Quote sent,
Signed (or Lost), on **AI CRM sales** (`/sales`). New prospects are AI CRM
accounts with the status `prospect`. The quote (package, option, fees,
discount, start date) lives on the deal. **Make contract** (admin, manager,
sales) creates the contract from it with a 12 month term, links it to the
deal, moves the deal to Signed and the account to onboarding. Automatic
invoices start off. Rules and tests: `app/src/lib/salesPipeline.ts`.

### Client portal (roadmap item 6, `20261103090000_client_portal.sql`)

Adds `portal_access`: private links that let an AI CRM client see their
open requests, build progress, usage against plan and monthly report at
`/portal`. The team makes a link per contact on the account page (Client
portal card) and sends it by WhatsApp or copy. The link holds a random
token after `#`; only its SHA-256 hash is stored, so a link is shown once.
Links work for 12 months and can be turned off at any time. Clients never
sign in and never read tables: the `client-portal` Edge Function checks the
link and returns only the fields chosen in `app/src/lib/clientPortal.ts`
(no fees, costs, notes or internal tickets details). Setup:
[client-portal.md](client-portal.md).

### AI help (roadmap item 7, `20261104090000_ai_assist.sql`)

Adds `ai_usage_log`. Claude Haiku summarises ticket threads, drafts replies
for a person to check, writes the monthly report summary from its numbers,
and turns call notes into requirements. The `ai-assist` Edge Function checks
the person can edit the account, and logs each request's cost against it, so
it counts as tool cost in profitability. Setup: [ai-help.md](ai-help.md).

### WhatsApp to tickets (roadmap item 8, `20261105120000_whatsapp_tickets.sql`)

Adds `tickets.requester_phone` and `ticket_messages.delivery_status`, and saves
each WhatsApp message once. The `whatsapp-in` function (Meta webhook) opens
or continues tickets from client messages; `whatsapp-send` sends replies
typed on the ticket, within WhatsApp's 24 hour reply window, and logs them.
Setup: [whatsapp-tickets.md](whatsapp-tickets.md).

### Service agreements (roadmap item 10, `20261107100000_agreement_templates.sql`)

Adds `agreement_templates`: versions of the service agreement wording with
`{{placeholders}}`. Service agreement on a client's Contract card fills the
approved version from the contract, package and rates (fees, term, usage
caps, overage prices, early exit fee, data protection terms) and downloads a
text PDF. A version is approved once by the lawyer (name and date recorded),
then locked by a trigger; changes start a new draft. Until a version is
approved, PDFs are marked DRAFT. Edit on Agreement template
(`/agreement-template`). Guide: [service-agreement.md](service-agreement.md).

### Client data export (roadmap item 12, no migration)

Export data on a client's page downloads a ZIP: a CSV per table, one JSON
file and a README. "Copy for the client" leaves out internal notes and costs;
"Full copy" (managers and admins) has everything. Guide:
[client-data-export.md](client-data-export.md).

### Backups and staging (roadmap item 13, no migration)

The nightly backup now test-restores itself into a throwaway Postgres and
compares row counts with live ([BACKUPS.md](BACKUPS.md)); CI runs the same
check. A staging copy with its own Supabase project is published at
`/RRCentral/staging/` once its secrets are set ([STAGING.md](STAGING.md)),
and the **Update staging database** workflow applies the migrations to it.

### Client health score (Tier 4, `20261110090000_report_calls.sql`)

Adds `report_calls` (attended, missed or moved, per client per month). The
score out of 100 adds usage against the plan, support tickets, report calls
attended and overdue invoices, with a churn warning. Client health page
(`/client-health`) and a Health card on each client. Guide:
[client-health.md](client-health.md).

### MRR view (Tier 4, no migration)

The MRR page (`/mrr`, managers and admins) shows this month's MRR, new and
lost, MRR with a churn warning, a 3 month forecast (contracts plus weighted
sales deals) and the last 12 months. Guide: [mrr.md](mrr.md).

## Roles

Roles live on `app_users.role`. RLS in the database and `app/src/lib/permissions.ts`
in the app apply the same rules.

| Role | Can |
| --- | --- |
| `admin` | Everything, including users, settings, secrets, rates and the audit log. The brief's "owner". |
| `manager` | Everything except users, settings and secrets. Edits packages and SLA policies, sees profitability and commission. The brief's "admin". |
| `sales` | All accounts and day to day work. Sees CTRM commission. No profitability, rates or settings. |
| `staff` | Only accounts where they are the owner, with their tickets, deals, hours and church details. Never sees commission. For the VA and freelancers. Home is the account list. |
| `viewer` | Reads everything except settings and the audit log. Changes nothing. Never sees commission. |

RLS helpers: `rr_can_read_account`, `rr_can_write_account`, `rr_is_staff()`
(admin, manager or sales), `rr_is_manager_or_admin()`, `rr_is_member()`.
Every module table follows the account it belongs to. The tests in
`supabase/tests/rls_test.sql` cover staff, viewer and anonymous access for each.

## Config values

All in `app_settings` unless noted. Rates are admin only to change
(`rr_is_protected_setting`), and are edited on **Packages and rates**.

| Key | Default | Used for |
| --- | --- | --- |
| `deliveryMarketingRateAed` | 0.30 | Marketing message above plan |
| `deliveryServiceRateAed` | 0.07 | Service or utility message above plan |
| `deliveryAiMarkupPercent` | 25 | AI usage above cap, at cost plus this |
| `deliveryLeadMarkupPercent` | 30 | Extra lead credits, at cost plus this |
| `deliveryInternalHourlyRateAed` | 150 | Hours in profitability and dashboard costs |
| `deliveryUsdToAed` | 3.6725 | AI and lead costs recorded in USD |
| `deliveryFixedMonthlyCostAed` | 0 | Fixed costs on the dashboard |
| `supportWorkingDays` | 1,2,3,4,5 | Working week for SLA (Monday is 1) |
| `supportDayStart`, `supportDayEnd` | 09:00, 18:00 | Working hours for SLA (Dubai time) |
| `sla_policies` table | package response days x 9h, churches 18h | First response times |

Edge Function secrets (never in the app or the repo; see `app/.env.example`):
`SUPPORT_INBOUND_SECRET` for email in, `WORSHIPHUB_API_URL`,
`WORSHIPHUB_API_TOKEN` and optional `WORSHIPHUB_API_KEY` for WorshipHub.

## How to add a package

1. In the SQL editor, add the package with a short unique `code`:

   ```sql
   insert into delivery_packages
     (code, name, monthly_fee_a, setup_fee_b, monthly_fee_b, target_hours, build_hours_target,
      included_whatsapp, support_response, support_response_days, tool_cost_aed, sort)
   values
     ('scale', 'Scale', 14000, 6000, 13000, 45, 40, 15000, 'Same day', 0, 900, 4);
   ```

   `support_response_days` of 0 means same day.

2. Give it a support response time:

   ```sql
   insert into sla_policies (applies_to, package_id, label, first_response_hours)
   select 'package', id, name || ' package', 4 from delivery_packages where code = 'scale';
   ```

3. Open **Packages and rates** to check the numbers. Prices, hours and response
   times can be edited there from then on. New contracts can pick it straight away.

To retire a package, set `active = false` on it. Existing contracts keep it.

## Test data

`supabase/seed/modules_seed.sql` fills a staging or local database with three
clients (one per package, one over hours), two churches, five CTRM prospects
(two stale), twelve tickets (two near their reply time) and one user per role.
It refuses to run unless you first `set rr.seed = 'not-production';`, and it
refuses on any database that already has invoices or quotations. The end of the
file shows how to remove it again. Never run it on production.

## Deploy order

Run the migrations in file name order. Each is safe to re-run and changes no
existing data. Then deploy the Edge Functions you use (`support-email-in`,
`worshiphub-read`, `daily-digest`, `client-portal`, `ai-assist`, `whatsapp-in`, `whatsapp-send`) and set their secrets. The bundled files next to them are
generated by `npm run build:support-fn` in `app/`, and CI fails if they are stale.
