Status: built and tested (draft)
Owner: Claude
PR: see the PR titled "Sentry / structured logs" (draft)
Stubbed / unverified: Sentry is OFF until Alfred creates a Sentry project and sets the DSN (paid service decision); the minimal sender has not been tried against a real Sentry project; no performance tracing or session replay; browser code does not yet call log() widely (errors only).

# Sentry / structured logs

## What changed
- **One log shape** for the app and Edge Functions: `{ ts, level, msg, source, fn?, request_id?, status?, duration_ms?, ... }` (`app/src/lib/observability/log.ts`, `supabase/functions/_shared/structuredLog.ts`).
- **Every Edge Function** that uses `withErrorLog` (all of them) now writes one JSON line per request: function, method, path, status, duration, request id (the caller's `x-request-id` if sane, else a new UUID). A crash answer includes the `request_id`, so a user can quote it.
- **Scrubbing** before anything is stored or sent: JWTs, Bearer tokens, hm_/whsec_/Stripe/Anthropic keys, `token=`/`password=` values, IBANs, Emirates IDs, card numbers, emails, phone numbers; and keys named password/secret/token/salary/iban/... in objects. Applies to `app_errors` rows from the browser and from functions (this is new: before, raw messages were stored). The app and Edge copies are kept identical by a Deno test.
- **Sentry, optional**: a tiny sender (no SDK, no new npm package) that posts scrubbed events to Sentry when a DSN is set. With no DSN nothing is sent and nothing changes.

## Setup for Alfred (only if you want Sentry)
1. Create a Sentry project (JavaScript). Copy its DSN.
2. GitHub → Settings → Secrets and variables → Actions → **Variables** → `VITE_SENTRY_DSN` = the DSN (the DSN is public by design, so a variable, not a secret). Re-run the Pages deploy.
3. Supabase → Edge Functions → Secrets → `SENTRY_DSN` = the same DSN. Redeploy functions as usual (Actions button).

Without these steps: structured logs and scrubbing still work; errors still go to **App errors** as before.

## Where to read logs
Supabase Dashboard → Edge Functions → pick a function → Logs. Filter by `request_id` or `"level":"error"`.

## Tests
- `app/src/lib/observability/observability.test.ts` (scrubber cases, DSN parse, envelope scrubbed, off without DSN, never throws, log shape).
- `supabase/tests/functions/observability_test.ts` (Edge scrubber identical to app's, log shape, request id, Sentry off).
- Existing `function_health_test.ts` still passes with the new wrapper.
