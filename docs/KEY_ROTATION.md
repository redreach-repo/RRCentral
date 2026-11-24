# Rotating the leaked Supabase service_role key

In October 2026 the live site was built with the `service_role` key in the
browser bundle, so that key must be treated as public. Supabase no longer lets
a project "regenerate" the legacy keys. The way to kill the old key now is:

- **Part 1:** move everything to the new API keys (`sb_publishable_...` and
  `sb_secret_...`), then switch the legacy anon and service_role keys off.
  Nobody is signed out and nothing stops working.
- **Part 2:** move the legacy JWT secret to JWT signing keys and revoke it.
  This is what makes the leaked service_role JWT useless everywhere (it is a
  signed token, so with only Part 1 it could still be sent as a login token).
  Nobody is signed out if you wait the 1 hour 15 minutes before revoking.

No SQL is needed. No laptop commands are needed.

## Where the keys are used (checked 24 Nov 2026)

| Place | Key | After the change |
| --- | --- | --- |
| GitHub secret `VITE_SUPABASE_ANON_KEY` (Pages build) | legacy anon | publishable key |
| Edge Functions (all of them) | injected automatically | read the new keys automatically (`_shared/supabaseKeys.ts`), fall back to legacy |
| Edge Function secret `MCP_JWT_SECRET` (AI connector) | legacy JWT secret | new HS256 signing key (Part 2) |
| Vercel `rrcentral-render-pdf` | none (gets the public key per request) | nothing to do |
| Vercel `worshiphub` | its own Supabase project, plus `RRCENTRAL_SUPPORT_INBOUND_SECRET` and `RR_CENTRAL_API_TOKEN`, which are not Supabase keys | nothing to do (see step 8) |
| pg_cron schedules | `x-cron-secret` header only | nothing to do |
| GitHub secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_URL` | personal token, DB password | nothing to do |

## Part 1: new API keys

1. Merge the pull request that adds this file.
2. Supabase → project **pszjylxrpvlumldtptrr** → **Project Settings** →
   **API Keys** → tab **Publishable and secret API keys**. If there are no
   keys yet, click **Create new API keys**. Copy the **publishable** key
   (starts `sb_publishable_`). Never copy the secret key anywhere.
3. GitHub → **RRCentral** → **Settings** → **Secrets and variables** →
   **Actions** → `VITE_SUPABASE_ANON_KEY` → pencil → paste the publishable key
   → **Update secret**.
4. GitHub → **Actions** → **Deploy GitHub Pages** → **Run workflow** (branch
   main). Wait for the green tick.
5. GitHub → **Actions** → **Deploy Edge Functions** → **Run workflow** with
   the function box left as **all**. Wait for the green tick.
6. Open RR Central, hard refresh (Ctrl+Shift+R), sign in. Open **System
   check**. Every row should say **Working (new keys)**. A row saying
   "old keys" or "older deploy" must be deployed again before step 9.
7. Quick test: open a client, a quote PDF and Mail. Ask Grok one question
   through the AI connector.
8. Vercel → **worshiphub** → **Settings** → **Environment Variables** → click
   the eye on `NEXT_PUBLIC_SUPABASE_URL`. It should **not** contain
   `pszjylxrpvlumldtptrr`. (If it does, stop and tell Claude.)
9. Supabase → **API Keys** → tab **Legacy API keys**. Check the "last used"
   times, then **disable** the legacy keys.
10. Hard refresh RR Central, sign in again, open **System check**. All green.
    If anything broke, re-enable the legacy keys on the same tab (one click)
    and tell Claude.

## Part 2: revoke the legacy JWT secret

Do this right after Part 1, or the next day.

11. Supabase → **Project Settings** → **JWT Keys** → **Migrate JWT secret**.
12. **Create standby key** → type **Shared secret (HS256)**. If it asks for
    the secret, paste a long random password (40+ characters) from your
    password manager; otherwise let it generate one. Create it, then open its
    ⋮ → **View key details** and copy the **secret** and the **key ID** into
    your password manager.
13. **Rotate keys**. The new key becomes current. The legacy secret moves to
    "Previously used" and still works, so nothing breaks yet.
14. Supabase → **Edge Functions** → **Secrets**:
    - `MCP_JWT_SECRET` → edit → paste the new secret.
    - Add `MCP_JWT_KID` → the key ID.
15. Ask Grok one question through the AI connector. It must answer.
16. Wait **1 hour 15 minutes** (so every signed-in session has renewed with
    the new key).
17. **JWT Keys** → the legacy secret under "Previously used" → ⋮ →
    **Revoke**.
18. Hard refresh RR Central, sign in, open **System check** (all green), test
    a PDF and Grok again.

The old leaked key is now dead. Nothing else holds it.

## If something goes wrong

- Part 1: re-enable the legacy keys (step 9 tab). Everything goes back to how
  it was.
- Part 2 before step 17: nothing is broken; the legacy secret still works.
- Part 2 after step 17: a revoked key cannot be un-revoked. Sign out and in
  again. If the AI connector fails, re-check `MCP_JWT_SECRET` and
  `MCP_JWT_KID` against the current key's details.
