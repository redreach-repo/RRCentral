# Overdue invoice chasing (aging, chase log, escalation)

HighMast improvement brief, fix 1 (Alfred, 25 Nov 2026).

## What changed, in plain words

- **Finance > Aging and chasing** (`/receivables`): every unpaid invoice that has gone out, with what is still owing after logged payments, grouped by client or listed, in buckets Current, 1 to 30, 31 to 60, 61 to 90 and over 90 days past due. Totals per currency (never added across currencies). Sort by any column, filter by client, division and age, export to CSV.
- **Chase log** on each invoice (Invoices > Actions > Chase log, or the Aging page): date, channel (email, call, WhatsApp, visit), contact, note, promised payment date and who logged it.
- **Chase schedule** per workspace (admin or manager sets it on the Aging page). Default: reminders at 1, 7, 14 and 30 days overdue, escalate to the owner at 45 days. When an invoice reaches a step, a follow-up task is made with a ready draft (email or WhatsApp). **Nothing is ever sent to a client automatically**: a person opens the draft and presses send. A missed early step is not added late (one task, not four at once), and no task is added while a promise is still pending. Tasks close themselves when the invoice is paid.
- **Broken promise**: a promised payment date that has passed with money still owing shows on the Dashboard ("Overdue invoices" card), on the Aging page and in the chase log.
- **AI connector**: `dashboard_summary` now has `receivables_aging` (totals per currency by bucket, broken promises, next chase action per overdue invoice). New tools: `list_invoice_aging` (read), `add_invoice_chase_note`, `complete_invoice_chase_task`. Same permission checks as the app (sales and up write, viewers read, staff none; department keys: finance and sales). The AI never changes the schedule, never edits or removes a chase note and never adds tasks.
- Invoice numbers, totals and payments are not changed.

## Setup

1. Run `supabase/migrations/20261328090000_ar_chase.sql` (copy page: ar-chase.sql). Safe to re-run; the undo steps are at the top of the file.
2. Deploy the `highmast-mcp` function (Actions > Deploy Edge Functions) for the AI connector tools.

Rules: `app/src/lib/arChase.ts` (shared by the app and the AI connector). Tests: `arChase.test.ts`, `supabase/tests/modules/ar_chase_test.sql` (one access check per role), `supabase/tests/functions/highmast_mcp_test.ts`.
