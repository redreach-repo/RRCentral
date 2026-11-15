Status: built and tested (draft)
Owner: Claude
PR: see the PR titled "Demo isolation" (draft)
Stubbed / unverified: the separate demo Supabase project does not exist yet (Alfred decides, per docs/M3A_DEMO.md); no demo deploy workflow yet; never run against a real demo project; presenter vs self-serve mode not built (open spec question); the demo still shows Red Reach brand kit assets until a demo brand kit is set.

# Demo isolation

Goal: a showcase copy of the CRM with made-up data where **nothing can leave**: no email, WhatsApp, payment, AI call or webhook, whichever screen or function tries.

## What is built
| Layer | Guard |
|---|---|
| Build | `npm run build` refuses a demo build (`VITE_APP_ENV=demo`) whose Supabase URL is the live project (`scripts/demo-target.mjs`, called from `assert-client-supabase-key.mjs`). Extra live URLs can be listed in `LIVE_SUPABASE_URL`. |
| Browser | In a demo build `window.fetch` only reaches this site and its own Supabase project; anything else is refused (`lib/demo/demoMode.ts`). An orange DEMO banner shows on every page. |
| Edge Functions | With the function secret `APP_ENV=demo`, every function (through `withErrorLog`) can only call its own Supabase URL plus hosts in `DEMO_OUTBOUND_ALLOW`. Stripe, Meta/WhatsApp, Zoho/Gmail/Microsoft mail, Anthropic and webhooks are all refused and logged as `demo outbound blocked`. `bootstrap-admin` and Cursor's `public-api` don't use the wrapper but only call Supabase. |
| Data | `supabase/seed/demo/demo_seed.sql`: 4 fictional accounts, 3 leads, 2 quotations, 2 invoices on `.example` domains, tenant renamed "Falcon Bay Trading (demo)". Refuses unless `set app.demo_seed = 'yes';` is run first **and** the database has no invoices or quotations, so it cannot run on live by mistake. |

## Setup for Alfred (when you decide to have a demo)
1. Create a second Supabase project (e.g. `highmast-demo`). Never reuse live keys.
2. Apply the migrations to it (same SQL as live, through its own SQL editor).
3. In its SQL editor: `set app.demo_seed = 'yes';` then paste `supabase/seed/demo/demo_seed.sql`.
4. Its Edge Function secrets: `APP_ENV=demo` (plus the usual Supabase ones). Deploy functions to that project.
5. Build the site with `VITE_APP_ENV=demo`, `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` of the demo project. A deploy workflow for this is the next step once the project exists (not added, so nothing points at a project that doesn't exist).

## Tests
- `app/src/lib/demo/demoMode.test.ts`: demo detection, live-target refusal, browser fetch guard.
- `supabase/tests/functions/demo_guard_test.ts`: Stripe, Meta, Anthropic, Zoho, webhook hosts refused in demo; own Supabase allowed; nothing wrapped outside demo.
- `supabase/tests/modules/demo_isolation_test.sql`: seed refuses without the flag and on a database with invoices; loads cleanly into an empty one; fictional data only.
