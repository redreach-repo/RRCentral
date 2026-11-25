# Revise and extend sent quotes (revisions, Extend validity, quote notes)

HighMast improvement brief, fix 2 (Alfred, 25 Nov 2026).

## What changed, in plain words

- Finalized, Sent and Expired quotes stay locked. Instead of editing them, **Quotations > Actions** now has:
  - **Revise**: makes a new Draft numbered like `RR-01-26008-R1` (R2, R3 after that), copying client, contact, account, lines (description, SKU, qty, unit price, unit cost, VAT, sizes), payment and delivery terms, MOQ, notes, discount and every currency / FX field. You pick the new valid-until date when you make it (default: the old date + 14 days, never less than 14 days from today). The old quote stays live until you **Finalize** the revision; then the old one becomes **Superseded** with a note pointing at the revision. Its totals, lines and PDF never change.
  - **Extend validity**: the same in one step when only the date changes. Asks for the new date and why (required), makes the revision, finalizes it at once (a Sent quote stays Sent) and supersedes the old one. Who extended it and why go in the notes.
  - **Notes**: an append-only notes log on every quote, in every status. Nobody can edit or remove a note. A revision shows the notes of the whole chain (the original and all its revisions). The same notes show on the deal that carries the quote number (CRM, open the deal).
- **Only one live revision per quote**: one open Draft revision at a time, and finalizing a revision supersedes every other live quote with the same base number. A revision cannot replace a quote the client already accepted or that was awarded, and a finalized revision never goes back to Draft (revise it again instead).
- **No deal or account?** The Notes window says so and offers to link a deal or account that matches the client by name (ignoring LLC, FZE and so on) or by the quote contact's email, or to create a company-pipeline deal for it (stage Quoted, follow-up 3 days before the quote expires).
- **AI connector**: `add_quote_note` for every key that reaches quotes; `revise_quote` and `extend_quote_validity` for admin keys with the sales department (they create a quote, like `create_quote`); `finalize_quote` keeps a revision's number; `get_quote` returns the notes. Same permission checks as the screens (the database functions run as the caller). Every AI revise or extend is in the audit log.
- Existing quote numbers, totals and history are not changed. New quotes keep the normal RR-XX-YYNNN numbers; only revisions get `-R1`.

## Access

| Role | Notes | Revise / Extend |
|---|---|---|
| admin, manager, sales | read and add | yes |
| viewer | read | no |
| staff | no (cannot see quotes) | no |

## Setup

1. Run `supabase/migrations/20261329090000_quote_revisions.sql` (copy page: quote-revisions.sql). Safe to re-run; the undo steps are at the top of the file.
2. Deploy the `highmast-mcp` function (Actions > Deploy Edge Functions) for the AI connector tools.

## Test case from the brief

Green Cement `RR-01-26008` (Sent, valid until 25 Nov 2026): Actions > Extend validity, date 9 Dec 2026 (the default), reason "Meeting with Green Cement on 25 Nov". Result: `RR-01-26008-R1`, Sent, valid until 9 Dec 2026; `RR-01-26008` Superseded with its total and PDF unchanged; then Actions > Notes to add the meeting note and link or create the deal.

Rules: `app/src/lib/quoteRevisions.ts`. Database: `rr_quote_revise`, `rr_quote_extend_validity`, `rr_quote_finalize_revision`, table `quote_notes`, triggers `rr_quote_revision_guard` and `rr_quote_revision_finalized`. Tests: `quoteRevisions.test.ts`, `supabase/tests/modules/quote_revisions_test.sql` (one access check per role, AI keys), `supabase/tests/functions/highmast_mcp_admin_db_test.ts` (AI tools end to end).
