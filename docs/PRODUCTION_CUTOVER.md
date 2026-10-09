# Production cutover — one team, one truth

Project: `pszjylxrpvlumldtptrr` · App: `https://redreach-repo.github.io/RRCentral/`

## Status (checked against live Pages + REST)

| Step | Status |
|------|--------|
| GitHub Actions secrets present (URL + key baked into Pages bundle) | **Yes — but key was wrong** |
| Browser key is **anon** / publishable (not `service_role`) | **FAIL — fix urgently** |
| Core tables + `rr_is_staff` / staff RLS helpers | Present |
| `customer_documents` (customer files) | Present |
| `audit_log` | **Missing — run migration** |
| `zohoPostHardeningRotationAck` in `app_settings` | **Missing — run migration** |
| Edge: `manage-auth-user` | Deployed |
| Edge: `zoho-proxy` | **Not deployed** |
| Edge: `create-checkout-session` | **Not deployed** |
| Edge: `bootstrap-admin` | Not deployed (preferred) |

---

## 0) Urgent — fix the GitHub Pages API key

The live bundle was built with **`VITE_SUPABASE_ANON_KEY` set to the `service_role` JWT**. That bypasses RLS for anyone who reads the public JS.

1. Supabase → **Project Settings → API**
2. Copy the **anon** `public` key (role must be `anon`, never `service_role`).
3. **Rotate** the `service_role` key (reveal → regenerate / rotate) so the leaked JWT stops working.
4. GitHub → **RRCentral → Settings → Secrets and variables → Actions**
   - `VITE_SUPABASE_URL` = `https://pszjylxrpvlumldtptrr.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = the **anon** key only
5. **Actions → Deploy GitHub Pages → Run workflow** (or push any `app/**` change).
6. Confirm in the new JS that the JWT payload `role` is `anon`, and the orange **Local mode** banner is gone after a hard refresh while signed in.

A build-time guard (`app/scripts/assert-client-supabase-key.mjs`) now **fails the Pages build** if `service_role` is supplied again.

---

## 1) Apply remaining SQL (Supabase SQL Editor)

Run in order (safe to re-run):

1. [`supabase/migrations/20260926080000_audit_log.sql`](../supabase/migrations/20260926080000_audit_log.sql)
2. [`supabase/migrations/20260926090000_security_rls.sql`](../supabase/migrations/20260926090000_security_rls.sql) — if not already fully applied
3. [`supabase/migrations/20261009120000_owned_domains_rls_fix.sql`](../supabase/migrations/20261009120000_owned_domains_rls_fix.sql) — if not already applied
4. [`supabase/migrations/20261009130000_zoho_rotation_ack_setting.sql`](../supabase/migrations/20261009130000_zoho_rotation_ack_setting.sql)

Verify:

```sql
select to_regclass('public.audit_log') as audit_log;
select key, value from public.app_settings where key = 'zohoPostHardeningRotationAck';
select policyname, roles::text from pg_policies where tablename = 'owned_domains';
```

Anon REST with the **anon** key must not return CRM rows for staff tables.

---

## 2) Deploy Edge Functions

From a machine with Supabase CLI access:

```bash
./scripts/deploy-edge-functions.sh
npx supabase secrets set --project-ref pszjylxrpvlumldtptrr STRIPE_SECRET_KEY='sk_…'
# optional:
npx supabase secrets set --project-ref pszjylxrpvlumldtptrr ALLOWED_ORIGINS='https://redreach-repo.github.io,https://www.redreach.ae,https://tee-tribe.com,https://www.tee-tribe.com'
```

Leave `bootstrap-admin` undeployed unless locked down (see its README).

---

## 3) Team smoke test

1. Two devices, same login → same CRM data (not IndexedDB).
2. No **Local mode** banner.
3. Settings → User management works (`manage-auth-user`).
4. Zoho Mail/WorkDrive actions work (`zoho-proxy`).
5. Tee Tribe checkout reaches Stripe (`create-checkout-session` + `STRIPE_SECRET_KEY`).
