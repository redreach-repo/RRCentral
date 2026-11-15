Status: built and tested (code-side)
Owner: Cursor agent (M0–M3a batch)
Stubbed / unverified: the separate demo Supabase project does not exist yet (Alfred, per docs/M3A_DEMO.md); no demo deploy workflow yet; self-serve rate limits / expiry deferred (docs/DECISIONS.md D3).

# Demo isolation

Goal: a showcase copy of the CRM with made-up data where **nothing can leave**: no email, WhatsApp, payment, AI call or webhook, whichever screen or function tries.

## What is built
| Layer | Guard |
|---|---|
| Build | `npm run build` refuses a demo build (`VITE_APP_ENV=demo`) whose Supabase URL is the live project (`scripts/demo-target.mjs`, called from `assert-client-supabase-key.mjs`). Extra live URLs can be listed in `LIVE_SUPABASE_URL`. |
| Browser | In a demo build `window.fetch` only reaches this site and its own Supabase project; anything else is refused (`lib/demo/demoMode.ts`). An orange DEMO banner shows on every page. |
| Edge Functions | With the function secret `APP_ENV=demo`, every function (through `withErrorLog`) can only call its own Supabase URL plus hosts in `DEMO_OUTBOUND_ALLOW`. Stripe, Meta/WhatsApp, Zoho/Gmail/Microsoft mail, Anthropic and webhooks are all refused and logged as `demo outbound blocked`. |
| Data | `supabase/seed/demo/demo_seed.sql`: Falcon Bay brand kit, 4 accounts, 4 contacts, 3 CRM leads, 1 sales deal, 2 quotations, 2 invoices on `.example` domains. Refuses unless `set app.demo_seed = 'yes';` **and** the database has no invoices/quotations. |
| Reset | `supabase/seed/demo/demo_reset.sql`: deletes demo-prefixed rows only when `is_demo` is true, then re-seeds. |
| Presenter UI | `DemoPresenterChrome`: guided tour checklist + UI role switcher (shell only; RLS unchanged). |

## Setup for Alfred (when you decide to have a demo)
1. Create a second Supabase project (e.g. `highmast-demo`). Never reuse live keys.
2. Apply the migrations to it (same SQL as live).
3. SQL editor: `set app.demo_seed = 'yes';` then run `demo_seed.sql`.
4. Edge Function secrets: `APP_ENV=demo` (plus the usual Supabase ones). Deploy functions to that project.
5. Build with `VITE_APP_ENV=demo` and the demo project's URL/anon key. Add a deploy workflow only after the project exists.

## Tests
- `app/src/lib/demo/demoMode.test.ts`, `demoRole.test.ts`, `demoTour.test.ts`
- `supabase/tests/functions/demo_guard_test.ts`
- `supabase/tests/modules/demo_isolation_test.sql`
