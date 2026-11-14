Status: built and tested (draft)
Owner: Claude
PR: see the PR titled "Field-level encryption" (draft)
Stubbed / unverified: tested on local Postgres 16 with a stand-in for Supabase Vault, not on Supabase itself; Cursor's HR and Payroll pages still read the plain columns (they must switch to rr_hr_sensitive() before enforcement is turned on); OAuth tokens in app_settings and webhook secrets are NOT encrypted yet (every Edge Function that reads them would need changing); payroll_lines amounts are not covered.

# Field-level encryption

## How it works
- AES-256 (`pgp_sym_encrypt` from pgcrypto, in the `extensions` schema as Supabase ships it).
- The key lives in **Supabase Vault** as a secret named `hm_fle_key_v1` (later `_v2`, …). It is never in a table, the repo, the browser or this chat.
- Stored values look like `fle:v1:<base64>`. The version lets keys rotate.
- On every save of `hr_employees`, salary and IBAN are encrypted into `basic_salary_enc` / `iban_enc`.
- The app reads them only through `rr_hr_sensitive(employee_id)`: **plain for manager and admin, masked for everyone else** (`AE•• •••• 3456`, salary hidden). Every read is logged in `fle_access_log` (admins can see it).
- App users cannot call the encrypt, decrypt or key functions.
- **Enforcement switch:** app setting `fle.enforce.hr = true` makes the database blank the plain `basic_salary_aed` and `iban` columns after encrypting. Until then the plain columns stay so Cursor's pages keep working. With enforcement on and no key, saves are refused rather than stored in plain text.

## Setup for Alfred (nothing applied yet)
1. Merge #414, #419 (permissions), then this.
2. Supabase → Project Settings → Vault → **New secret**: name `hm_fle_key_v1`, value = a long random string (at least 32 characters; a password manager can make one). Keep a copy in your password manager: **if the key is lost, encrypted salaries and IBANs cannot be recovered.**
3. SQL copy page: run `20261222090000_field_level_encryption.sql`.
4. Encrypt existing rows: `select public.rr_fle_reencrypt_hr();`
5. When Cursor's HR/Payroll pages read through `rr_hr_sensitive()`, turn on enforcement: `insert into app_settings (key, value) values ('fle.enforce.hr', 'true') on conflict (key) do update set value = 'true';` then run step 4 again to blank the plain columns.

## Rotating the key
Add Vault secret `hm_fle_key_v2`, set `app_settings.fle.key_version = 2`, run `select public.rr_fle_reencrypt_hr();`. Keep v1 in Vault until that finishes.

## Decisions for Alfred
- Who holds the master copy of the key and how often to rotate it (spec "Needs Alfred").
- Whether managers (not only admins) should see salaries in plain text. Today: manager and admin.

## For Cursor
- Read salary/IBAN with `getHrSensitive(id)` from `app/src/lib/fieldEncryption/fieldEncryption.ts` instead of the table columns.
- `hr_employees` has `unique (tenant_id, employee_code)` with default `''`, so a second employee without a code fails to save. Consider a partial unique index `where employee_code <> ''`.

## Tests
`supabase/tests/modules/field_encryption_test.sql` (26 checks): no-key behaviour, enforcement refusal, round trip, wrong key fails, short key refused, internals not callable by app users, plain vs masked per role, other tenant and stranger refused, access log, backfill, unrelated edits keep the salary, rotation to v2. `app/src/lib/fieldEncryption/fieldEncryption.test.ts`.
