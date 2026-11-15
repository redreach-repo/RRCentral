# M3a — Demo / showcase project

**Goal:** A separate Supabase project for presenter/self-serve demos with fictional data, outbound blocked, and no real client brands (Tee Tribe excluded per spec §B.7).

**Code-side status:** Complete for this batch (guards, seed, reset, guided tour, role switcher).  
**Ops status:** **Alfred still provisions** the second Supabase project and secrets — this agent does not create cloud projects.

## Why not staging?

`docs/STAGING.md` is the engineering sandbox (same product, separate DB). M3a is a **showcase** environment with:

| Rule | Staging | M3a demo |
|------|---------|----------|
| Audience | Internal engineers | Prospects / presenters |
| Data | Ad-hoc test rows | Curated fictional Falcon Bay story |
| Outbound email/WhatsApp/AI | Often unset | **Hard-blocked** |
| Brands | May mirror ops | No live client brands |
| Provisioning | Exists | **Ask Alfred** |

## Code shipped

| Piece | Location |
|-------|----------|
| DEMO banner + browser fetch guard | `DemoBanner`, `lib/demo/demoMode.ts` |
| Build refuses demo→live URL | `scripts/demo-target.mjs` |
| Edge outbound kill-switch | `APP_ENV=demo` via `withErrorLog` |
| Seed pack | `supabase/seed/demo/demo_seed.sql` |
| Presenter reset | `supabase/seed/demo/demo_reset.sql` |
| Guided tour + role switcher | `DemoPresenterChrome` (demo build only) |
| Module notes | `docs/modules/demo-isolation.md` |

## Checklist for Alfred

1. Confirm region (prefer same as live; record residency decision from §19 when ready).
2. Name project e.g. `highmast-demo` — never reuse live or staging credentials.
3. GitHub secrets (demo-scoped):
   - `DEMO_SUPABASE_URL`
   - `DEMO_SUPABASE_ANON_KEY`
   - `DEMO_DB_URL` (session pooler URI)
4. Apply migrations (copy staging pattern; refuse live URL).
5. SQL editor: `set app.demo_seed = 'yes';` then run `demo_seed.sql`. Later resets: `demo_reset.sql`.
6. Edge Function secrets: `APP_ENV=demo` (+ usual Supabase). Optional `DEMO_OUTBOUND_ALLOW`.
7. Build with `VITE_APP_ENV=demo` and demo Supabase URL/anon key. Deploy workflow **after** project exists.

## Rules

- Do not copy production PII into demo
- Do not claim the demo project is provisioned until Alfred confirms URL + secrets
- Do not enable paid QTSP or live payment rails in demo
- Role switcher is UI-only; RLS still follows the signed-in `app_users` row
