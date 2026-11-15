# Feature slices (M6–M12)

**Date:** 15 November 2026 (Asia/Dubai)  
**Rule:** Demo / M3a left alone. WPS/gratuity helpers are **not legal advice**.

| Feature | Spec | Usable slice |
|---------|------|----------------|
| HR | §6.5 / M6 | People CRUD, salary/IBAN/labour card/routing, draft gratuity preview |
| Payroll | §6.6 / M8 | Runs, generate lines from HR, WPS CSV + SIF draft export, submit/approve/paid |
| WPS / gratuity | §11 / M8 | `wpsGratuity.ts` (CSV + SCR/EDR SIF draft, IBAN/labour/routing validators, readiness) |
| Marketing | §6.10 / M10 | Campaigns with budget/dates + activate/pause/done |
| SaaS tenant billing | §6.13 / M11 | Plan catalog, trial/activate/cancel, seat usage; Stripe Checkout + portal (`docs/saas-billing.md`) |
| Industry packs | §3 / M12 | Catalog + activate/retire; activation enables shell module flags from manifest |
| Maker-checker | §3 / M7 | Approvals queue, self-approve block; payroll + large expenses (≥ AED 5k) |
| Public REST + webhooks | §3 / M11 | Keys + HMAC webhooks; reads + `POST/PATCH /v1/accounts`; Edge `webhook-retry` worker |

Module flags (default **hidden** until Settings): `hr`, `payroll`, `marketing`, `saasBilling`, `industryPacks`. Approvals and API live under Admin.

## Migrations

- `20261217120000_feature_slices_m6_m12.sql` — tables + RLS
- `20261217140000_feature_slices_deepen.sql` — HR IBAN/allowances, webhook delivery audit, extra packs
- `20261217160000_wps_sif_draft_fields.sql` — HR labour card + bank routing for SIF drafts
- `20261217170000_public_api_webhook_retries.sql` — webhook failure counters + delivery attempt log

## Still later (not claimed done)

- Bank-certified WPS/SIF file format + legal counsel sign-off (draft deepen shipped; see `docs/COMPLIANCE_NOTES.md` § WPS)
- Real marketing send providers
- Invoice/quotation write endpoints
- Stripe Tax registration for live UAE/GCC SaaS charges
