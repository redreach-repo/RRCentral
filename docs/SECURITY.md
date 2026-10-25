# Security — RED REACH Central

This repository is **public** and `app/public/` is published to the internet.
Never commit customer data, exports, backups, tokens or keys.

## Access model

| Who | Can do |
|-----|--------|
| Anonymous visitor | Submit the website contact form (insert-only, length-limited, burst-rate limited). Shop checkout. Nothing else. |
| Signed in, **not** in `app_users` (any other Google account) | Nothing — sees “No access to RR Central”. |
| `sales` (active in `app_users`) | Read/write CRM, quotes, invoices, delivery notes, vendors, expenses, Wanders. Cannot delete CRM/quotes/clients, reassign CRM owner, delete invoices/expenses, manage users, change company/bank/Zoho settings, or read integration secrets. |
| `manager` | Sales capabilities plus delete CRM/quotes/clients and reassign owners. No Settings/secrets/audit/invoice-expense deletes. |
| `admin` | Everything, including the audit trail (Settings → Audit log). |
| `staff` (VA, freelancers) | Only the accounts they own (`accounts.owner_user_id`), with their contacts and timeline. Can add a new account only as its owner. No access to CRM, quotes, invoices, finance or any other older module. |
| `viewer` | Read only. Sees accounts and the operational tables. Cannot read secrets, the audit log or the company document vault, and cannot write anything. |

Staff and viewer rules: migration `20261023090000_accounts_foundation.sql`. It narrows `rr_is_staff()` to admin, manager and sales so the restricted roles never inherit the older blanket policies. If `20260926090000_security_rls.sql` is ever re-run, re-run the accounts migration after it.

Manager/sales delete rules: migration `20261009140000_manager_delete_policies.sql` (`rr_is_manager_or_admin()`). UI permissions in `app/src/lib/permissions.ts` match those policies.

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

## The browser key (checked 25 Oct 2026)

The Pages build embeds `VITE_SUPABASE_ANON_KEY` in the public JavaScript, so it
must be the **anon** key. The Pages log of 25 Oct 2026 (run 140) showed it was the
**service_role** key, which skips row level security: anyone could read and change
the whole database from the browser console. To fix it:

1. Supabase → Project Settings → **API Keys** → **Legacy API keys**. Copy **anon / public**.
2. GitHub → RRCentral → Settings → Secrets and variables → Actions →
   `VITE_SUPABASE_ANON_KEY` → pencil → paste → **Update secret**.
3. Actions → **Deploy GitHub Pages** → **Run workflow**. Sign in and check that clients and invoices load.
4. Rotate the leaked key (see "What to rotate" below, row 1).

Checks that keep it fixed:

- `npm run build` refuses a service_role key (`app/scripts/assert-client-supabase-key.mjs`);
  there is no override any more.
- After the build, CI and the Pages deploy scan every file in `app/dist` and decode the
  `role` claim of each JWT they find (`npm run scan:bundle`). A service_role key fails the job,
  so it can never be published, whatever the secret is called.
- The app itself refuses a service_role key at runtime (`app/src/lib/supabaseConfig.ts`).

## Make the repository private

Until it is private, anyone can read every old commit, including the files below.
GitHub Pages from a **private** repository needs **GitHub Pro** (personal account,
about USD 4 a month) or Team (organisation). On the Free plan, making the repo private
**switches the site off**. Choose one:

**Option 1, keep GitHub Pages (recommended, no code change).**

1. github.com → your picture → Settings → Billing and plans → upgrade to **Pro**.
2. RRCentral → Settings → General → scroll to **Danger Zone** → **Change visibility** →
   **Make private** → type the repo name to confirm.
3. RRCentral → Settings → **Pages**: check Source is still **GitHub Actions**. Run
   Actions → **Deploy GitHub Pages** → **Run workflow** once and open the site.
4. Forks: on the repo page, check the **Forks** count. Public forks stay public after you
   make this repo private. If there are any, ask their owners to delete them, or report them
   to GitHub Support.

**Option 2, move hosting to Vercel (free plan is enough).**

1. Make the repo private as in Option 1 step 2 (the Pages site stops).
2. vercel.com → Add New → Project → import `redreach-repo/RRCentral`.
   Root Directory `app`, Framework **Vite**, Build Command `npm run build`, Output `dist`.
3. Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (anon key),
   `VITE_BASE` = `/`. Deploy.
4. Add `vercel.json` in `app/` with a rewrite of every path to `/index.html` (ask for a PR),
   then in Supabase → Authentication → URL configuration replace the github.io redirect
   URL with the Vercel one.
5. Settings → Pages → **Unpublish** the old site.

## Purge the old export and invoice PDF from git history

These were published and are still in old commits:

| File | What it is |
|------|-----------|
| `app/public/migration-data.json` | full CRM and finance export |
| `app/public/invoices/26107_Ello_Pets_Hotel_Day_Care.pdf` | a customer invoice |

[`scripts/purge-sensitive-git-history.sh`](../scripts/purge-sensitive-git-history.sh)
removes them (plus any `migration-data-clean.json`, `rrcentral-backup-*.json` and anything
under `app/public/invoices/`) from every commit. This **rewrites history and is not
reversible** on GitHub, so do it once, with no open pull requests, after a backup.
It needs a computer with git and Python. Exact commands (macOS or Linux terminal):

```bash
# 0. Merge or close every open pull request first. Their branches are rewritten too.
# 1. Install the tool
python3 -m pip install --user git-filter-repo

# 2. Backup copy of everything, kept until you are sure
git clone --mirror https://github.com/redreach-repo/RRCentral.git RRCentral-backup.git

# 3. Fresh working copy to rewrite
git clone --mirror https://github.com/redreach-repo/RRCentral.git RRCentral-purge.git
cd RRCentral-purge.git
git filter-repo --force \
  --path app/public/migration-data.json \
  --path app/public/migration-data-clean.json \
  --path-glob 'app/public/rrcentral-backup-*.json' \
  --path app/public/invoices/ \
  --invert-paths

# 4. Check nothing is left (prints 0)
git log --all --name-only --format= | grep -cE 'migration-data|app/public/invoices/' || true

# 5. Put the rewritten history back on GitHub
#    (filter-repo removes the remote as a safety step, so add it again)
git remote add origin https://github.com/redreach-repo/RRCentral.git
git push --force --mirror origin
```

`git push --mirror` fails on the read-only `refs/pull/*` refs; that is expected. GitHub
keeps old pull request pages and cached commits, so afterwards:

6. Open a ticket at https://support.github.com → "Remove sensitive data", list the two
   paths above and ask them to purge cached views and pull request refs for
   `redreach-repo/RRCentral`.
7. Anyone with an old clone (other laptops, Cursor, Lovable) must delete it and clone again.
   Pushing from an old clone brings the files back.
8. Treat the data as disclosed: consider notifying affected customers as UAE PDPL requires.

The app **no longer auto-imports** `migration-data.json` in local mode unless an operator
sets `localStorage.rrcentral_allow_sheets_dump_import = '1'`. CI still fails if dumps
are placed under `app/public/`.

## What to rotate after the purge

Making the repo private or purging does not un-leak a secret. Change these:

| # | Secret | Why | Where to change it |
|---|--------|-----|--------------------|
| 1 | Supabase **service_role** key | was in the public site bundle until Oct 2026 | Supabase → Project Settings → **JWT Keys** → Legacy JWT secret → generate a new secret. This also changes the anon key and signs everyone out. Edge Functions pick up the new keys by themselves. Then repeat "The browser key" steps 1 to 3 with the new anon key, and update any other place that holds the old keys (the TeeTribe site's `SUPABASE_SERVICE_ROLE_KEY` if it points at this project, staging secrets if they reuse it). |
| 2 | Supabase **anon** key | public by design, but changes with row 1 | done by row 1 |
| 3 | `info@redreach.ae` password | an initial password was committed (Oct 2026, default admin) | sign in as info@ → change password; also set a new `BOOTSTRAP_ADMIN_PASSWORD` if that secret is set |
| 4 | Apps Script `apiToken` | the default value is in history | App Settings sheet → new random value (or empty), `clasp push`, redeploy |
| 5 | Zoho client secret and refresh token | were readable by any signed-in account before Sep 2026 | Zoho API console → regenerate → Settings → Zoho → **Mark Zoho credentials rotated** |
| 6 | Database password | only if it was ever pasted anywhere public | Supabase → Project Settings → Database → Reset password, then update the `SUPABASE_DB_URL` Actions secret |

A scan of the full history on 25 Oct 2026 found no committed Supabase JWT, Stripe,
GitHub or Anthropic key. If you ever paste a key into a commit, rotate it the same day.

## Post-hardening checklist (admin)

1. Change `info@redreach.ae` password if it was ever the documented default.
2. Do **not** deploy `bootstrap-admin` without `BOOTSTRAP_ADMIN_SECRET` + `BOOTSTRAP_ADMIN_PASSWORD` secrets; leave it undeployed on production when possible.
3. Apply `20261009120000_owned_domains_rls_fix.sql` if `owned_domains` was created before this fix.
4. In **Settings → Zoho**, regenerate Zoho client secret + refresh token, save, then click **Mark Zoho credentials rotated** (sets `zohoPostHardeningRotationAck`).
5. **GitHub Actions `VITE_SUPABASE_ANON_KEY` must be the anon key.** See "The browser key" above. The build and the bundle scan fail if `service_role` is supplied again.

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
  `public/`, a service_role key in the built site, high-severity dependency advisories, and RLS test failures.
- **Backups**: nightly encrypted database dump (see `docs/BACKUPS.md`).

## Reporting

Email alfred@redreach.ae. Please don’t open public issues for vulnerabilities.
