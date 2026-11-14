# Feature slices (M6–M12)

**Date:** 15 November 2026 (Asia/Dubai)  
**Rule:** Demo / M3a left alone. WPS/gratuity helpers are **not legal advice**.

| Feature | Spec | Usable slice |
|---------|------|----------------|
| HR | §6.5 / M6 | People CRUD, status filter, salary/IBAN, draft gratuity preview |
| Payroll | §6.6 / M8 | Runs, generate lines from active HR, WPS CSV from lines, submit/approve/paid |
| WPS / gratuity | §11 / M8 | `wpsGratuity.ts` (years-of-service, daily wage, net, CSV) |
| Marketing | §6.10 / M10 | Campaigns with budget/dates + activate/pause/done |
| SaaS tenant billing | §6.13 / M11 | Plan catalog, trial/activate/cancel, seat usage vs HR headcount |
| Industry packs | §3 / M12 | Catalog + tenant activate/retire (`tenant_industry_packs`) |
| Maker-checker | §3 / M7 | Approvals queue, self-approve block, payroll auto-wire ≥ AED 5k |
| Public REST + webhooks | §3 / M11 | Key revoke, webhook test fire, Edge `public-api` `/v1/me` + `/v1/accounts` |

Module flags (default **hidden** until Settings): `hr`, `payroll`, `marketing`, `saasBilling`, `industryPacks`. Approvals and API live under Admin.

## Migrations

- `20261217120000_feature_slices_m6_m12.sql` — tables + RLS
- `20261217140000_feature_slices_deepen.sql` — HR IBAN/allowances, webhook delivery audit, extra packs

## Still later (not claimed done)

- Stripe Checkout for HighMast SaaS plans
- Bank-certified WPS/SIF file format + legal counsel sign-off
- Real marketing send providers
- Full public API write surface + signed webhook retries
