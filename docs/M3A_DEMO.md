# M3a — Demo / showcase project (prep)

**Goal:** A separate Supabase project for presenter/self-serve demos with fictional data, outbound blocked, and no real client brands (Tee Tribe excluded per spec §B.7).

**Status:** Prep only. **Alfred still provisions** the second Supabase project and secrets — this agent does not create cloud projects.

## Why not staging?

`docs/STAGING.md` is the engineering sandbox (same product, separate DB). M3a is a **showcase** environment with:

| Rule | Staging | M3a demo |
|------|---------|----------|
| Audience | Internal engineers | Prospects / presenters |
| Data | Ad-hoc test rows | Curated fictional story |
| Outbound email/WhatsApp/AI | Often unset | **Hard-blocked** |
| Brands | May mirror ops | No live client brands |
| Provisioning | Exists | **Ask Alfred** |

## Checklist before Alfred provisions

1. Confirm region (prefer same as live; record residency decision from §19 when ready).
2. Name project e.g. `rr-central-demo` — never reuse live or staging credentials.
3. GitHub secrets (demo-scoped, parallel to staging):
   - `DEMO_SUPABASE_URL`
   - `DEMO_SUPABASE_ANON_KEY`
   - `DEMO_DB_URL` (session pooler URI)
4. Apply migrations via a dedicated “Update demo database” workflow (copy staging pattern; refuse live URL).
5. Seed fictional companies/deals only — script TBD; no export from production.
6. Edge Functions: deploy with outbound kill-switches (mail/calendar/WhatsApp/Stripe webhooks no-op or dry-run).
7. UI: demo banner + `VITE_APP_ENV=demo` (same idea as purple STAGING bar).

## App hooks to add after project exists

- [ ] `VITE_APP_ENV=demo` build path (Pages or separate host)
- [ ] Outbound guard: `isDemoEnv()` blocks send/calendar write/Stripe live charge
- [ ] Seed pack: fictional CRM + sales + CTRM stories (no Tee Tribe)
- [ ] Presenter vs self-serve mode (open §19 — do not invent)

## Rules

- Do not copy production PII into demo
- Do not claim the demo project is provisioned until Alfred confirms URL + secrets
- Do not enable paid QTSP or live payment rails in demo
