Status: built and tested (draft PR)
Owner: Cursor (M4–M7 batch)
Stubbed / unverified: starter CoA tax mapping; no auto-post from invoices/expenses yet; VAT return engine not built.

# Accounting ledger (M7)

Double-entry journals with an immutable posted state and a UAE SME **starter** chart of accounts.

## Tables
- `gl_accounts` — code, name, type (asset/liability/equity/revenue/expense)
- `gl_journals` — draft | posted | void; posted headers cannot be edited back to draft
- `gl_journal_lines` — one-sided debit **or** credit; posted lines immutable

## Functions
- `rr_gl_journal_balanced(uuid)` — debits = credits and > 0
- `rr_gl_post_journal(uuid)` — manager/admin, same tenant, draft only

## UI
- `/ledger` under Finance (manager+). Create balanced draft, post, browse CoA.

## Setup for Alfred
1. Apply `20261230120000_accounting_ledger.sql` via SQL copy (not production CLI).
2. Enable Finance module flag if hidden.
3. Have accountant review starter CoA before live books (`docs/COMPLIANCE_NOTES.md` § Ledger).

## Tests
- `app/src/lib/ledger/ledger.test.ts`
- `supabase/tests/modules/accounting_ledger_test.sql`
