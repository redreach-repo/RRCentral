# Quote follow-up chasing (waiting quotes, follow-up log, schedule)

Next phase of "Quote and invoice chasing" (Alfred, 28 Nov 2026). The invoice side is in [ar-chasing.md](ar-chasing.md); this does the same for quotes that went out and have no answer yet.

## What changed, in plain words

- **Sales > Quote follow-up** (`/quote-followup`): every Sent quote with no decision yet, plus quotes the client accepted through the link and quotes that expired in the last 7 days. For each: value, days since it was sent, valid until, last follow-up, the client's answer, any agreed call-back date and the next thing to do. Totals per currency by how long the quotes have waited (up to 7 days, 8 to 14, 15 to 30, over 30), never added across currencies. Sort by any column, filter by client, division, wait and "show" (needs a decision, expiring soon, missed call-back, follow-up due now), export to CSV.
- **Needs you now** at the top of the page and on the Dashboard: quotes that need a person's decision rather than another chase.
  - The client accepted through the link: mark it Awarded.
  - A client PO is linked to the quote (or names its number) but the quote still shows Sent: mark it Awarded. Sharjah ReadyMix RR-01-26007 with PO 4200050362 is the brief's example.
  - The quote expired: it stays on the list for 7 days after its valid-until date (also once the quote list has marked it Expired), so someone revises it, extends the validity or marks it not awarded, instead of it going quietly.
  - The client declined: mark it Not awarded with the reason.
  - A call-back date that was agreed has passed with no newer follow-up (a "missed call-back").
- **Follow-up log** on each quote (Quotations > Actions > Follow-ups, or the Quote follow-up page): date, channel (email, call, WhatsApp, visit), contact, note, the client's answer (no reply, interested, wants changes, on hold, declined), call-back date and who logged it. Logging never changes the quote; Awarded, Not awarded and revisions stay the buttons they already are.
- **Follow-up schedule** per workspace (admin or manager sets it on the page). Default: follow up 3, 7 and 14 days after the quote was sent, remind the client 3 days before it expires, escalate to the owner at 21 days. When a quote reaches a step, a task is made with a ready draft (email or WhatsApp; the team's own "Quote follow up" message template is used when there is one). **Nothing is ever sent to a client automatically**: a person opens the draft and presses send. A follow-up logged in the two days before a step counts as that step. A missed early step is not added late (one task, not three at once). No task is added while a call-back is still to come, after the client declined, or when the quote needs a decision. Tasks close themselves when the quote stops waiting (awarded, not awarded, superseded, expired or accepted). Follow-up tasks go to the client's account owner, else whoever made the quote; escalations go to the person chosen in the schedule, else the owners.
- **Sales lock**: a Sales user without "see company money" sees and logs follow-ups only on their own quotes, the same as the quotes themselves.
- **AI connector**: `dashboard_summary` now has `quote_followups` (value waiting per currency, quotes needing a decision, client POs not yet awarded, expiring soon, missed call-backs, next follow-up per quote with its task id). New tools: `list_quote_followups` (read), `add_quote_chase_note`, `complete_quote_chase_task`. Same permission checks as the app (sales and up write, viewers read, staff none; department keys: sales and finance). The AI never changes the schedule, never edits or removes a follow-up, never adds tasks and never changes a quote's status.
- Quote numbers, lines, totals and statuses are not changed. The older "quote sent, no reply in 3 days" nudge on My Day stays as it is.

## Setup

1. Run `supabase/migrations/20261334090000_quote_chase.sql` (project file: quote-chase.sql). Run it after sales-own-clients.sql so the Sales lock applies (it says so with a notice and skips the lock otherwise; run it again afterwards). Safe to re-run; the undo steps are at the top of the file.
2. Deploy the `highmast-mcp` function (Actions > Deploy Edge Functions) for the AI connector tools.

Rules: `app/src/lib/quoteChase.ts` (shared by the app and the AI connector). Tests: `quoteChase.test.ts`, `supabase/tests/modules/quote_chase_test.sql` (one access check per role, the Sales lock, AI keys), `supabase/tests/functions/highmast_mcp_test.ts`.
