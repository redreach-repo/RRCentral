# Run state — HighMast Step A

Last run: **A1 (money and field-level encryption)**, 2026-11-15, branch `build/step-a`. Next session: **A2**.

## Done and tested
- `app/src/lib/money/` shared money module: bigint minor units, ISO 4217 decimals (JPY 0, AED 2, KWD 3), half away from zero like Postgres `round()`, allocate / convert / divide, exact formatting.
- Invoice and quote totals (`lineItems.ts` `calcTotals`, `calcLine`, discounts), `money.ts`, `currency.ts`, ledger helpers, auto-post, payroll net, gratuity, WPS SIF and the payroll page now go through it.
- Property tests (sum of parts, no drift after 5,000 operations, rounding bound), AED/JPY/KWD exact totals, regression fixtures produced by the old float formulas (`app/scripts/gen-money-regression-fixtures.mjs`): all old totals reproduced.
- Float guard: `app/src/lib/money/floatGuard.test.ts` (core money files must have no float rounding; everything else shrink-only, baseline 175).
- SQL `20261320120000_a1_money_server_payroll_ledger.sql`: per-currency rounding, payroll maths in the database (generate, update, totals; net recomputed on every save), payroll amounts widened to `numeric(18,3)`, journals can only be posted through `rr_gl_post_journal`. Browser uses the RPCs and falls back to its old path until the SQL is applied.
- SQL `20261320130000_a1_field_encryption_reveal.sql`: per-value session keys under the Vault key, encrypted-only Emirates ID / passport / national ID, encrypted copies of passenger passports, payroll amounts and token settings, `rr_hr_masked`, `rr_fle_reveal` (permission, rate limit, audit entry), `rr_fle_backfill` (dry run first) and `rr_fle_backfill_reverse`, audit-log redaction.
- HR edit form: "Protected details" panel with masked values and a logged Reveal (EN + AR, theme tokens for light/dark).

## Half done
- See `docs/REMAINING.md` "A1 not done" (float money outside the core path, Edge Functions reading tokens, HR page plain columns, invoice column scale).

## Next
- A2: roles, record rules, field permissions, maker checker, Zod (needs the #419 permission question settled first).

## Test commands
```bash
cd app && npm ci && npx tsc -b && npx oxlint && npx vitest run
# Database (local Postgres 16, never production):
PGHOST=/tmp/pg PGUSER=postgres bash supabase/tests/run.sh
# Just the A1 database tests (after run.sh has built rr_rls_test):
psql -d rr_rls_test -f supabase/tests/modules/a1_money_server_test.sql
psql -d rr_rls_test -f supabase/tests/modules/a1_field_encryption_reveal_test.sql
```
Results this run: 316 test files / 1,469 unit tests pass, `tsc -b` clean, oxlint 0 errors (2 old warnings), every migration applies twice, all SQL suites pass (a1_money_server 21 checks, a1_field_encryption_reveal 38 checks).
