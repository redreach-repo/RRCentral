# Security — RED REACH Central

This repository is **public** and `app/public/` is published to the internet.
Never commit customer data, exports, backups, tokens or keys.

## Access model

| Who | Can do |
|-----|--------|
| Anonymous visitor | Submit the website contact form (insert-only, length-limited). Shop checkout. Nothing else. |
| Signed in, **not** in `app_users` (any other Google account) | Nothing — sees “No access to RR Central”. |
| `sales` (active in `app_users`) | Read/write CRM, quotes, invoices, delivery notes, vendors, expenses, Wanders. Cannot delete invoices/expenses, manage users, change company/bank/Zoho settings, or read integration secrets. |
| `admin` | Everything, including the audit trail (Settings → Audit log). |

Enforced by Postgres Row Level Security in
[`supabase/migrations/20260926090000_security_rls.sql`](../supabase/migrations/20260926090000_security_rls.sql),
not just the UI. Tests: [`supabase/tests/rls_test.sql`](../supabase/tests/rls_test.sql) (run in CI).

Deactivate someone by unticking **Active** in Settings → Users — they lose access immediately.

## Rolling out the hardening (one-time, in this order)

1. **Check the admins.** In Supabase → Table editor → `app_users`, make sure every
   teammate who should keep access is listed with `active = true`.
2. **Apply migrations** (oldest first): `npx supabase db push`, or paste
   `20260926080000_audit_log.sql` then `20260926090000_security_rls.sql` into the SQL Editor.
3. **Redeploy the Edge Functions:**
   ```bash
   npx supabase functions deploy zoho-proxy
   npx supabase functions deploy create-checkout-session --no-verify-jwt
   npx supabase secrets set STRIPE_SECRET_KEY=sk_live_...        # restricted key is fine
   # optional, defaults cover redreach-repo.github.io, redreach.ae, localhost:
   npx supabase secrets set ALLOWED_ORIGINS=https://redreach-repo.github.io,https://www.redreach.ae
   ```
4. **Rotate Zoho credentials.** Zoho secrets used to be readable by any signed-in account.
   In the Zoho API console, regenerate the client secret and refresh token, then save them
   in Settings → Zoho (admin).
5. **Legacy Apps Script:** the old default `apiToken` is public in git history. Set a new
   random value (32+ chars, e.g. `Utilities.getUuid() + Utilities.getUuid()`) in the App
   Settings sheet — or leave it empty to keep the external API/export disabled — then push
   the updated `appscript/` (`clasp push`) and redeploy.
6. **Supabase Auth settings:** Authentication → Providers → Email: enable magic link for
   `@redreach.ae` (Zoho). Prefer disabling Google. Keep “Confirm email” on.
   Authentication → URL configuration: only
   `https://redreach-repo.github.io/RRCentral/login` (and localhost for dev) as redirect URLs.

## Data that was public (urgent owner action)

Until this change, `app/public/migration-data.json` (a full CRM/finance export) and a
customer invoice PDF were deployed to GitHub Pages and are still present in **git
history** of this public repository. Removing them from the branch stops new deploys
serving them, but anyone can still read old commits. Options (owner decision):

- Make the repository private (GitHub Pages on a private repo needs a paid plan), and/or
- Run [`scripts/purge-sensitive-git-history.sh`](../scripts/purge-sensitive-git-history.sh)
  (`git filter-repo`), force-push all branches/tags, and ask GitHub Support to clear cached views.
- Treat the exposed data as disclosed: consider notifying affected customers as required
  by UAE PDPL.

The app **no longer auto-imports** `migration-data.json` in local mode unless an operator
sets `localStorage.rrcentral_allow_sheets_dump_import = '1'`. CI still fails if dumps
are placed under `app/public/`.

## Post-hardening checklist (admin)

1. Change `info@redreach.ae` password if it was ever the documented default.
2. Do **not** deploy `bootstrap-admin` without `BOOTSTRAP_ADMIN_SECRET` + `BOOTSTRAP_ADMIN_PASSWORD` secrets; leave it undeployed on production when possible.
3. Apply `20261009120000_owned_domains_rls_fix.sql` if `owned_domains` was created before this fix.
4. In **Settings → Zoho**, regenerate Zoho client secret + refresh token, save, then click **Mark Zoho credentials rotated** (sets `zohoPostHardeningRotationAck`).
5. **GitHub Actions `VITE_SUPABASE_ANON_KEY` must be the anon key.** If `service_role` was ever used, rotate `service_role` in Supabase → API, fix the secret, redeploy Pages. The build fails if `service_role` is supplied again.

## Other protections

- **Content Security Policy** (production build): scripts only from our origin; no plugins;
  `base-uri`/`form-action` locked. See `app/vite.config.ts`.
- **Zoho proxy** requires a signed-in active team member, only talks to Zoho hosts, only
  answers our own origins, and loads secrets server-side.
- **Checkout** prices come from the server-side catalog; Stripe may only redirect back to
  allowed origins.
- **Audit trail**: database triggers log every insert/update/delete on key tables with the
  actor’s email and before/after values (secrets redacted). Admin-only.
- **CI** blocks merges on lint/type/test failures, stale checkout bundle, data dumps in
  `public/`, high-severity dependency advisories, and RLS test failures.
- **Backups**: nightly encrypted database dump (see `docs/BACKUPS.md`).

## Reporting

Email alfred@redreach.ae. Please don’t open public issues for vulnerabilities.
