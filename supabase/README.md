# supabase/

| Folder | What |
|--------|------|
| `migrations/` | Schema changes, applied **in filename order**. Every file is safe to re-run except the baseline. |
| `scripts/` | One-off maintenance SQL (data clean-ups). Not run automatically. |
| `functions/` | Edge Functions: `zoho-proxy` (Zoho for signed-in staff), `create-checkout-session` (shop). |
| `tests/` | Applies all migrations to plain Postgres and runs RLS tests (`bash supabase/tests/run.sh`). CI runs this. |

## Applying migrations

**New project:** `npx supabase link --project-ref <ref>` then `npx supabase db push`
(or paste each file into the SQL Editor, oldest first).

**Existing project** (already has the baseline + upgrades from the old `app/supabase-*.sql` files):
apply only the files you have not run yet — for the September 2026 hardening that is
`20260926080000_audit_log.sql` then `20260926090000_security_rls.sql`.
Read [`docs/SECURITY.md`](../docs/SECURITY.md) first — the RLS migration locks out anyone not in `app_users`.

## Adding a migration

1. Create `migrations/<YYYYMMDDHHMMSS>_<what>.sql`. Use `if not exists` / `drop … if exists` so it can re-run.
2. New tables automatically get the “staff full access” policy when `…_security_rls.sql` is re-run;
   otherwise add policies in your migration (see that file for patterns) — RLS is on for every table.
3. Add RLS expectations to `tests/rls_test.sql` if access differs by role.
4. `bash supabase/tests/run.sh` against a local Postgres (PGHOST/PGUSER env) before opening a PR.
