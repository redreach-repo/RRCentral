# Live tests

One test per feature that talks to an outside service, to run with the real
keys after setup and after each wave. Start with test 0: it shows in one
screen which functions are deployed and which secrets are missing.

Where to look when a test fails, in this order:

1. **System check** (Admin menu): the function's row says Down, Check or OK, why, and its last error.
2. **App errors** (Admin menu): the full error. Every function failure is saved there
   (kind "Server function", the function name as the page).
3. Supabase → **Edge Functions** → the function → **Logs**: the raw log, for anything the first two do not explain.

Deploying a function: GitHub → RRCentral → **Actions** → **Deploy Edge Functions** →
**Run workflow** → pick it → **Run workflow**. Secrets: Supabase → **Edge Functions** → **Secrets**.

| # | Feature | Function |
|---|---------|----------|
| 0 | System check | all |
| 1 | AI help | `ai-assist` |
| 2 | Usage import | `usage-import` |
| 3 | WhatsApp in | `whatsapp-in` |
| 4 | WhatsApp out | `whatsapp-send` |
| 5 | Daily digest | `daily-digest` |
| 6 | Client portal link | `client-portal` |
| 7 | WorshipHub support ticket | `support-email-in` |
| 8 | WorshipHub review buttons | `worshiphub-read`, `worshiphub-manage` |
| 9 | Other functions | `zoho-proxy`, `manage-auth-user`, `create-checkout-session`, `teetribe-order-sync` |
| 12 | One tap payment reminders | `payment-reminder` |

---

## 0. System check

**Trigger.** Sign in as an admin. Admin menu → **System check**. Press **Check again** after each deploy.

**You should see.** One row per function. OK (green) for everything you use. The ping does
not send, import or change anything.

**If it fails.**
- *Not deployed*: deploy it from Actions.
- *Deployed, but an older version*: deploy it again (the health check came with Wave 1).
- *Secret not set: NAME*: add that secret in Supabase, then **Check again**. Functions read secrets on each call, so no redeploy is needed.
- *Could not reach*: check Supabase is up (status.supabase.com) and the site is online.

## 1. AI help

**Trigger.** Open an AI CRM account → **Requirements** → **From call notes**. Paste
"Client wants a WhatsApp bot that books appointments and sends reminders" → run it.
Also open any ticket → **Summarise**.

**You should see.** A list of suggested requirements to tick, and a short ticket summary,
within about 20 seconds. On the account, **Profitability this month** shows a small AI cost.

**If it fails.** "AI help is not set up yet": add `ANTHROPIC_API_KEY` (a normal key, not the admin key).
"Sign in to RR Central first": sign out and in again. "You can only use AI help on accounts
you can edit": use an account you own, or an admin login. Anything else: App errors, row `ai-assist`.

## 2. Usage import

**Trigger.** On an AI CRM client, Usage → **Links**: enter its WhatsApp number (digits with country
code) and Anthropic workspace ID. Then **Packages and rates** → **Import now**.

**You should see.** "Last run" on Packages and rates shows what was imported. The client's Usage card
shows this month's WhatsApp counts and AI spend, marked imported. Months typed in by hand are left alone.

**If it fails.** The last run lists each failed source and why. A source with no secrets is skipped,
not failed: check `META_WABA_ID`, `META_ACCESS_TOKEN`, `ANTHROPIC_ADMIN_KEY` on System check.
For the daily schedule, check `USAGE_IMPORT_CRON_SECRET` matches the one in the schedule SQL
(docs/usage-import.md, step 4).

## 3. WhatsApp in

**Trigger.** From a phone number saved on a client contact (WhatsApp or phone field), send
"Live test 3" to the business WhatsApp number.

**You should see.** Within a minute, a new ticket in **Support**, channel WhatsApp, filed on that client,
with the SLA clock running. A second message joins the same ticket.

**If it fails.** No ticket at all: in Meta → WhatsApp → Configuration → Webhook, the callback URL must be
`https://pszjylxrpvlumldtptrr.supabase.co/functions/v1/whatsapp-in`, verified, with **messages** subscribed.
App errors row `whatsapp-in` answered 401: `WHATSAPP_APP_SECRET` is not the app's secret
(Meta → App settings → Basic). Ticket is unfiled: the number on the contact does not match.

## 4. WhatsApp out

**Trigger.** On the ticket from test 3 (within 24 hours of the message), write "Live test 4 reply" →
**Send on WhatsApp**.

**You should see.** The reply on the phone. On the ticket: Sent, then Delivered, then Read.
It counts as the first reply for the SLA.

**If it fails.** Button greyed out: more than 24 hours since the client's last message (Meta's rule).
"WhatsApp sending is not set up yet": add `WHATSAPP_PHONE_NUMBER_ID` and `META_ACCESS_TOKEN`.
Not delivered: the token lacks `whatsapp_business_messaging`, or the number is not on the API.

## 5. Daily digest

**Trigger.** **Packages and rates** → Daily digest: add yourself as a recipient (email, and WhatsApp
if the template is approved) → **Send now**.

**You should see.** The digest email within a few minutes: overdue invoices, tickets, renewals,
and the last day's app errors. WhatsApp gets the counts-only template.

**If it fails.** No email: Settings → Zoho must have Mail on and working. No WhatsApp: the template
`rr_daily_digest` must be approved in Meta. Schedule not sending at 08:00 Dubai: `DIGEST_CRON_SECRET`
must match the schedule SQL (docs/daily-digest.md). App errors row `daily-digest`.

## 6. Client portal link

**Trigger.** On an AI CRM account → **Client portal** card → make a link for a contact → copy it.
Open it in a private browser window (not signed in).

**You should see.** The client's open requests, build progress, usage against plan and monthly reports.
No fees, costs, notes or team names. The card shows "last opened" a moment later.
Then press **Turn off** on the card and reload the private window: it must say the link does not work any more.

**If it fails.** "This link does not work any more" straight away: the link was copied
incompletely (it must include everything after `#`), or it expired. App errors row `client-portal`.

## 7. WorshipHub support ticket

**Trigger.** Go to https://www.worship-hub.com/support and send the form with subject "Live test 7"
(signed in as a church user, or as a visitor with your email).

**You should see.** A ticket in RR Central **Support** within a minute, channel Web form, filed on that
church's account (or unfiled for an unknown visitor). Replying by email from the ticket reaches the sender.

**If it fails.** WorshipHub shows an error: on Vercel (project `worshiphub`) check
`RRCENTRAL_SUPPORT_INBOUND_URL` and `RRCENTRAL_SUPPORT_INBOUND_SECRET`, then Redeploy. App errors row
`support-email-in` with 401: that secret must equal Supabase `SUPPORT_INBOUND_SECRET`.

## 8. WorshipHub review buttons

**Trigger.** As an admin, open **Products** (WorshipHub). The church list must load. Make a test church
sign up on WorshipHub, then on its join request press **Accept**, then **Verify**.

**You should see.** The church list with plan, users and renewal. After Accept the join request disappears;
after Verify it shows the badge in WorshipHub public search. Audit log → "WorshipHub review actions"
lists both. **Delete** works only on an empty test church.

**If it fails.** "WorshipHub connection failed" banner: `WORSHIPHUB_API_URL` and `WORSHIPHUB_API_TOKEN` in
Supabase must match `RR_CENTRAL_API_TOKEN` on Vercel. Buttons missing: you are not signed in as an admin.
A refused action is in the audit log with WorshipHub's reason.

## 9. Other functions

- **Zoho** (`zoho-proxy`): Settings → Zoho → test the connection, or send any document by email.
- **Team passwords** (`manage-auth-user`): Settings → Users → set a password for a test user.
- **Shop checkout** (`create-checkout-session`): add an item on /shop and press checkout. Stripe opens
  (in test mode with a test key). Needs `STRIPE_SECRET_KEY`.
- **Tee Tribe orders** (`teetribe-order-sync`): place a Tee Tribe test order. Needs the same
  `CRM_SYNC_SECRET` in Supabase and on the Tee Tribe site.

Each one fails into App errors under its own name, and its System check row turns amber for a day.

---

## 12. One tap payment reminders

**Trigger.** Make a test invoice to your own company account (with a contact that has your email and
WhatsApp), finalise it with a date 10 days ago and Net 7 days. Open **Invoices**: it shows under
**Payment reminders due** as a 3 day reminder.

**You should see.** Press **Email**: the reminder arrives at the contact's address within a minute, the
row disappears, and the account's timeline has "3 day payment reminder … sent by email to …". The audit
log has the invoice_reminders row under your name. Pressing again (or a colleague at the same time) sends
nothing: "This reminder was already sent." Do the same with **WhatsApp** once the template is approved.

**If it fails.** The toast says why (no contact address, Zoho Mail not connected, WhatsApp template not
approved). Nothing is recorded when sending fails, so you can press again once fixed. System check row
"One tap payment reminders"; App errors under `payment-reminder`.

