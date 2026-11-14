# Feature first slices (M6–M12)

**Date:** 15 November 2026 (Asia/Dubai)  
**Rule:** Demo / M3a left alone. These are **first slices**, not finished modules.

| Feature | Spec | Slice shipped |
|---------|------|----------------|
| HR | §6.5 / M6 | `hr_employees` + People list/create |
| Payroll | §6.6 / M8 | `payroll_runs` / `payroll_lines` + run list |
| WPS / gratuity | §11 / M8 | Pure calc stubs (`wpsGratuity.ts`); **not legal advice** |
| Marketing | §6.10 / M10 | `marketing_campaigns` + campaign list |
| SaaS tenant billing | §6.13 / M11 | `tenant_subscriptions` + plan catalog shell |
| Industry packs | §3 / M12 | `industry_packs` registry + activate stub |
| Maker-checker | §3 / M7 | `approval_requests` + Approvals queue |
| Public REST + webhooks | §3 / M11 | `api_keys` / `webhook_endpoints` + `public-api` Edge health |

Module flags (default **hidden** until enabled in Settings): `hr`, `payroll`, `marketing`, `saasBilling`, `industryPacks`. Approvals and API keys live under Admin (always reachable for admins).
