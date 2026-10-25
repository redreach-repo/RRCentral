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
| 10 | Contract invoices each morning | `contract-invoices` |
| 11 | Daily watchdog | `watchdog` |
| 12 | One tap payment reminders | `payment-reminder` |
| 13 | My deals | none (app and SQL only) |
| 14 | Next step and lost reason | none (app and SQL only) |
| 15 | Website and WhatsApp leads | `lead-intake` |
| 16 | Quote accept links | `quote-accept` |
| 17 | Quote follow up templates and nudges | `daily-digest` |
| 18 | Fireflies calls on the timeline | `fireflies-fetch` |
| 19 | Card payment links on invoices | `invoice-pay-link`, `stripe-invoice-webhook` |

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

---

## 9. Other functions

- **Zoho** (`zoho-proxy`): Settings → Zoho → test the connection, or send any document by email.
- **Team passwords** (`manage-auth-user`): Settings → Users → set a password for a test user.
- **Shop checkout** (`create-checkout-session`): add an item on /shop and press checkout. Stripe opens
  (in test mode with a test key). Needs `STRIPE_SECRET_KEY`.
- **Tee Tribe orders** (`teetribe-order-sync`): place a Tee Tribe test order. Needs the same
  `CRM_SYNC_SECRET` in Supabase and on the Tee Tribe site.

Each one fails into App errors under its own name, and its System check row turns amber for a day.

---

## 10. Contract invoices each morning

**Trigger.** Set up as in `docs/contract-invoices.md`. The next morning, without opening the app
before 06:30 Dubai time, open **Invoices**.

**You should see.** A draft (INV-DRAFT-…) for each AI CRM contract with automatic invoicing on that
came due, created by "RR Central daily run", and a line on the client's timeline. On the 1st of the
month, each such contract gets that month's draft. The 08:00 digest has a "Contract invoices" row
when any were drafted. Running the schedule again the same day adds nothing.

**If it fails.** System check, row "Contract invoices each morning". Down with
`CONTRACT_BILLING_CRON_SECRET` means the secret is not set. In the SQL Editor,
`select * from cron.job_run_details order by start_time desc limit 5;` shows whether the schedule ran.

---

## 11. Daily watchdog

**Trigger.** Set up as in `docs/watchdog.md`. The next morning, open the dashboard.

**You should see.** A **Watchdog** card listing your items and the ones nobody owns (**Show everyone's**
for the rest), each with a reason, an owner and a link. The 08:00 digest has "Invoices 3, 7 or 14 days
late" and "Deals nobody has touched" when there are any. Fix one (for example, log a touch on a stale
deal or record a payment): the next morning it is gone.

**If it fails.** System check, row "Daily watchdog list". Down with `WATCHDOG_CRON_SECRET` means the
secret is not set. No card on the dashboard means the list is empty or the "Watchdog" SQL has not been run.

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

---

## 13. My deals

**Trigger.** Run the "Wave 3: My deals" SQL from the copy page once. Sign in as yourself and open
**Sales → My deals**.

**You should see.** Your open deals from the CRM, AI CRM sales and CTRM Next in one table, with value,
weighted value, next action and days in stage. Switch to **Board** to see them by stage. Pick
**Everyone** to see the whole team. Move a test deal to another stage on its own page, come back: its
days in stage is 0. Sign in as a viewer or staff login: CTRM Next deals show no value (commission stays
hidden), and staff see no CRM deals.

**If it fails.** "Could not load the deals" names the table. Days in stage that never reset means the
SQL has not been run. Nothing goes to App errors unless the page itself crashes.

---

## 14. Next step and lost reason

**Trigger.** Run the "Wave 3: Next step and lost reason" SQL from the copy page once. Take a test deal in
each of CRM, AI CRM sales and CTRM Next.

**You should see.** Moving a deal to an open stage without a next action or date stops with "Every open
deal needs a next action" (or "Give the next action a date") and opens the deal to add it. Moving to Lost
asks for a reason from the list and a note; both are needed, and the timeline shows them. The dashboard
has a **No next step** card listing open deals with no next action or date.

**If it fails.** A move that saves without a next step means the SQL has not been run. "column lost_note
does not exist" (or lost_reason_code) means the same.

---

## 15. Website and WhatsApp leads

**Trigger.** In a private browser window open the website contact page with
`?utm_source=test&utm_campaign=live-check` on the end of the address. Wait a few seconds, then send the form
with your own name and a phone number nobody else in the CRM has.

**You should see.** The form says "Received". On the dashboard, **New leads** shows your name with
"Website form, test, live-check, new contact". It links to a new CRM lead at stage Lead with next action
"Call the new lead" for today, owned by the person set under **Packages and rates → New leads: who gets
them**. Send the form again with the same phone: no second CRM row, the note is added to the first one and
the lead says "known contact". Next morning's digest has "New leads in the last day".

**WhatsApp link.** Open `https://pszjylxrpvlumldtptrr.supabase.co/functions/v1/lead-intake?wa=1&text=Hi&utm_source=test`:
WhatsApp opens on the Red Reach number with "Hi" typed. The click is counted but is not a lead.

**If it fails.** System check row "Website and WhatsApp leads". Down with `LEAD_INTAKE_SECRET` means the
secret is not set. If the form still says "Received" but nothing shows under New leads, the "Lead intake"
SQL has not been run (the form then falls back to the old direct save). App errors under `lead-intake`.

---

## 16. Quote accept links

**Trigger.** Make a test quote to your own company and finalise it. If you want to see the contract part,
put its RR number in **Quote reference** on a test AI CRM deal at Quote sent. Open the quote (**PDF / Email**),
press **Accept link**, then **Make a new link**. The link is copied. Open it in a private browser window.

**You should see.** The quote's number, amount and an **Open the quote PDF** button that shows the same PDF.
Type a name, keep today's date, tick the box and press **Accept**: "Accepted. Thank you." Back in RR Central the
quote shows **Accepted**, the test deal is **Signed** with a **draft** contract (it bills nothing), and an open CRM
lead for the client is **Won**. As admin, **Accept link** shows who accepted, the date, the time and the address.
Opening the link again shows it was accepted; it cannot be accepted twice. **Turn off** on a new link makes it say
"This link does not work any more".

**Finalise by hand.** Mark the quote **Awarded** with **Outcome** to invoice it, and activate the draft contract
on the account.

**If it fails.** "Run the Quote accept link SQL first" means the SQL has not been run. System check row
"Quote accept links"; App errors under `quote-accept`.

---

## 17. Quote follow up templates and nudges

**Trigger.** Packages and rates → **Follow up templates**: add a WhatsApp template for one division using
`{{name}}`, `{{quote_number}}` and `{{amount}}`; the preview below the box fills them with sample values.
Then mark a test quote to your own company **Sent**. To see the nudge today without waiting, run this in the
Supabase SQL editor with its RR number: `update quotations set sent_at = now() - interval '4 days' where reference_number = 'RR-…';`

**You should see.** CRM → **My Day** shows **Quotes waiting for a reply** with the quote, its amount and
"4 days without a reply". **WhatsApp** opens WhatsApp to the client's contact with your template filled in;
**Email** opens your email with the subject and message ready. The row disappears and comes back 3 days later
if the quote is still Sent. Next morning's digest lists it under "Quotes waiting 3 days for a reply" (redeploy
`daily-digest` first).

**If it fails.** "Run the Follow up templates SQL first" means the SQL has not been run. "No WhatsApp or phone
number" means the account's contact or the CRM row has no number.

---

## 18. Fireflies calls on the timeline

**Trigger.** In Fireflies, open a recent call with a client and copy its link from the address bar. In RR Central
open that client's AI CRM account, press **Fireflies call** under Timeline, paste the link and press
**Get the summary**.

**You should see.** The call's title, date, length, people, summary and action items. **Add to timeline** puts
it on the timeline as a Meeting with the summary, the action items and a link to the transcript. Because it is
an AI CRM build client, **Requirements from call notes** opens by itself and AI help lists the requirements it
found; tick the ones to keep and press **Add**. Adding the same call again says "This meeting is already on the
timeline". On a church or CTRM account the call is only added to the timeline.

**If it fails.** "Fireflies is not set up yet" means `FIREFLIES_API_KEY` is not set. "Fireflies refused the API
key" means the key is wrong. System check row "Fireflies calls on the timeline"; App errors under `fireflies-fetch`.

---

## 19. Card payment links on invoices

**Setup (once).** Use the RR Central Stripe account, not the Tee Tribe one.
1. Stripe → Developers → API keys: copy the secret key. Supabase → Edge Functions → Secrets → add
   `RR_STRIPE_SECRET_KEY`.
2. Stripe → Developers → Webhooks → **Add endpoint**:
   `https://pszjylxrpvlumldtptrr.supabase.co/functions/v1/stripe-invoice-webhook`, events
   `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Copy its signing secret into
   the Supabase secret `RR_STRIPE_WEBHOOK_SECRET`.
3. Deploy `invoice-pay-link` and `stripe-invoice-webhook`.

**Trigger.** With Stripe in test mode, make a small test invoice to your own company and finalise it. On
**Invoices**, press **Card link**: "Card payment link for AED … copied". Open it and pay with the test card
4242 4242 4242 4242.

**You should see.** Within a minute the invoice is **Paid**, its payment history has "Card (Stripe)" with the
amount and currency, the income row is Paid and the invoice drops off **Payment reminders due** and the
watchdog list. Pressing **Card link** again says it is already paid. Pay half by **Pay** (bank transfer) first and
the card link asks only for the rest.

**If it fails.** "Card payments are not set up yet" means `RR_STRIPE_SECRET_KEY` is missing. If the payment goes
through in Stripe but the invoice stays unpaid, check Stripe → Webhooks for the delivery error and the System
check row "Card payments mark invoices paid".

