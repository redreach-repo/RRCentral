Status: built and tested (draft)
Owner: Cursor
PR: (this batch)
Stubbed / unverified: Stripe Tax registration, live ESP, credit enforcement on every write path

## What it does

- `POST /v1/quotations/:id/finalize`
- Industry packs: `logistics` + `events_tours` templates
- `accounts.credit_limit_aed` / `credit_hold` + Account detail UI + `creditGate` helper
- `project_billing_schedules` + mark billed → bumps WIP
- Marketing dry-run send (local status only)
- `STRIPE_TAX_STUB=1` → Checkout `automatic_tax.enabled`

## Alfred

Apply `20261303120000`–`140000`. Redeploy `public-api` + `saas-checkout`. Optional: set `STRIPE_TAX_STUB` only after understanding Stripe Tax is still Unverified.
