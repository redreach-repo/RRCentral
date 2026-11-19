# Remaining work (HighMast Step A)

## A1 check: what already existed before this session (2026-11-15)

| A1 item | Already in code before A1 | Files |
|---|---|---|
| Money: exact type / shared module | No. `round2` / `roundMoney` / `money2` used float `Math.round(n*100)/100` in 4 copies | `lib/money.ts`, `lib/lineItems.ts`, `lib/currency.ts`, `lib/ledger/ledger.ts`, `lib/ledger/autoPost.ts` |
| Money: `numeric` in SQL | Mostly yes (`numeric(14,2)`); no per-currency rounding | migrations `…feature_slices_m6_m12`, `…accounting_ledger` |
| Ledger posting server side | Partly: `rr_gl_post_journal()` existed, but a browser could set `status = 'posted'` directly | `20261230120000_accounting_ledger.sql` |
| Payroll calculation server side | No: browser computed net, gratuity, WPS readiness | `lib/featureSliceStores.ts`, `lib/wpsGratuity.ts` |
| Field encryption: salary, IBAN | Yes (Vault key, `rr_hr_sensitive`, opt-in blanking) | `20261222090000_field_level_encryption.sql` |
| Field encryption: ID numbers, passports, pay lines, tokens | No | — |
| Masked by default + reveal with permission, rate limit, audit | No (manager/admin always got plain; every read logged) | — |
| Backfill with dry run + reverse | Partly (`rr_fle_reencrypt_hr`, no dry run, no reverse) | — |

## A1 result (branch `build/step-a`)

Done and tested: see `docs/RUN_STATE.md`.

## A1 not done (carry forward)

1. **Float money outside the core path.** 175 float rounding patterns remain in other files (reports, CTRM commission, Wanders booking money, expenses page, PO pages, CSVs, some are percentages). `app/src/lib/money/floatGuard.test.ts` stops the count growing; lower `FLOAT_MONEY_BASELINE` as files move to `lib/money`. Commission and PO maths are the next to convert.
2. **Invoice / quote amounts in SQL are `numeric(14,2)`.** Fine for AED; a KWD invoice would lose the third decimal in the database. Widening those columns touches views and is left for an owner-approved migration.
3. **Edge Functions still read OAuth tokens from `app_settings.value`.** They must switch to `rr_app_secret(key)` before `fle.enforce.settings` is turned on (Gmail, M365, Google Drive, Zoho functions).
4. **HR people page and CSV export still read plain salary / IBAN columns.** Turning on `fle.enforce.hr` needs those to read through `rr_hr_masked` / `rr_fle_reveal`. Masked exports are A2 (field permissions).
5. **Payroll line amounts stay readable in their plain columns** (an encrypted copy is kept in `pay_enc`). Blanking them needs the payroll page to read through server functions; A2 field permissions decide who sees them.
6. **HR / payroll table permissions.** Fixed by `20261321090000_hr_payroll_manager_only.sql` (manager and admin only on `hr_employees`, `payroll_runs`, `payroll_lines`, `hr_attendance_days`). The new server functions check roles, but direct table access is A2's record and field rules.
7. **Journal drafts are still created from the browser** (posting is enforced in the database; drafts are checked when posted).
8. **Not run on Supabase itself.** Everything is tested on local Postgres 16 with a Vault stub.
