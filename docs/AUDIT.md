# RR Central / RRCRM — Repository audit (M0)

**Date:** 13 November 2026 (Asia/Dubai)  
**Authority:** RRCRM Master Specification v1.1  
**Scope:** Read-only audit of the live Red Reach operations app. No product code was changed in this step.  
**Repo:** `redreach-repo/RRCentral` (Vite + React SPA, Supabase Postgres / Auth / Storage / Edge Functions, Stripe, GitHub Pages).

---

## 1. Executive summary

RR Central is a **single-tenant** operations suite for Red Reach Middle East FZE. It already covers CRM/pipelines, quotes→invoices→delivery notes, accounts/delivery/support, finance lists, Drive, WhatsApp/email intake, NDA e-sign, contract auto-billing, WorshipHub, Wanders, and Tee Tribe shop — with **89 public tables, all RLS-enabled**.

It is **not** yet a multi-tenant subscription platform. There is no `tenant_id`, no customization layer, no double-entry ledger, no HR/payroll, no full mail sync beyond Zoho Mail/Calendar proxy, and TypeScript `strict` is off in the main app.

**M0 RLS criterion:** pass — every `CREATE TABLE` in `supabase/migrations` has RLS enabled. Two tables intentionally have RLS with **no policies** (deny-all to anon/authenticated; service-role only): `drive_connection`, `worship_setup_log`.

---

## 2. Stack and hosting

| Layer | Today |
|-------|--------|
| Web | Vite + React SPA, TypeScript (app `strict` **not** enabled; Tee Tribe package uses `strict: true`) |
| Auth | Supabase Auth email/password when configured; else IndexedDB **local mode** |
| DB | Supabase Postgres + RLS; migrations applied by hand / CI |
| Jobs | `pg_cron` + `pg_net` → Edge Functions with cron secrets; browser fallback for contract billing |
| Storage | Supabase Storage / Drive uploads via Edge Function |
| Hosting | GitHub Pages for SPA; Edge Functions on Supabase |
| Payments | Stripe (invoice pay links + Tee Tribe Checkout) |
| Observability | No Sentry in repo |

---

## 3. Auth and roles

| Piece | Path / behaviour |
|-------|------------------|
| Session | `app/src/contexts/AuthContext.tsx` — Supabase session or local fake session |
| Gate | `ProtectedRoute` + `TwoStepGate`; membership via `app_users`; `@redreach.ae` login domain |
| Roles | `admin` · `manager` · `sales` · `staff` · `viewer` (`app/src/lib/permissions.ts`) |
| Admin Auth API | Edge `manage-auth-user`, optional `bootstrap-admin` |
| App auth | UI permission checks + Postgres helpers (`rr_is_staff`, `rr_can_read_account`, …) |

Local mode bypasses RLS (single-browser IndexedDB). Production expects Supabase.

---

## 4. Routes

### Public
`/` → `/login` · `/login` · `/portal` · `/accept` · `/sign` · `/shop/*` · `/teetribe` → `/shop` · `*` → `/login`

### Protected (no Layout)
`/ctrm/summary` · `/accounts/:id/report` · `/accounts/:id/fit-sheet` · `/document/:type/:id`

### Protected (Layout)
| Path | Page |
|------|------|
| `/app` | Dashboard (staff → `/accounts`) |
| `/crm` | My Day (legacy CRM) |
| `/quick-add` | Phone lead/call |
| `/deals` | Unified pipeline |
| `/sales` | AI CRM sales stages |
| `/ctrm` | CTRM Next stages |
| `/follow-ups` | Follow-ups |
| `/quotations` · `/invoices` · `/delivery-notes` | Docs |
| `/customer-files` | Google Drive index |
| `/accounts` · `/accounts/:id` | Accounts hub |
| `/support` · `/support/:id` | Support desk |
| `/ctrm-issues` | CTRM ticket aggregator |
| `/client-health` · `/client-reports` · `/client-updates` | CS queues |
| `/products` | WorshipHub |
| `/delivery-settings` · `/build-templates` | Packages / build templates |
| `/agreement-template` · `/nda-template` | Legal templates |
| `/app/wanders` | RR Wanders |
| `/catalog` · `/inventory` · `/templates` · `/domains` | Ops |
| `/payments` · `/expenses` · `/vendors` · `/reports` | Finance |
| `/mrr` · `/insights` · `/duplicates` | Manager finance |
| `/settings` · `/audit-log` · `/app-errors` · `/system-check` | Admin |

Nav: accordion sidebar (Overview / Sales / Clients / Delivery / Operations / Finance / Admin). Phone: Home · My Day · Quotes · Follow-ups + Shortcuts drawer.

---

## 5. Database tables and RLS

**Count:** 89 tables under `supabase/migrations` with RLS enabled.  
**CI:** `supabase/tests/run.sh` includes `rls_test.sql` in the migrations job.

### Intentional deny-all (RLS on, no policies)
- `drive_connection` — OAuth refresh; service role only  
- `worship_setup_log` — service role only  

### Dual / overlapping models (debt)
- Legacy `crm` + `clients` alongside `accounts` / `account_contacts` / `account_activities`
- `sales_deals` and `ctrm_deals` as separate pipelines; `/deals` unifies in UI
- Nullable `account_id` on crm/quotes/invoices/clients; soft name match until linked

### Full table list (alphabetical)
`account_activities`, `account_contacts`, `account_link_log`, `accounts`, `activity_log`, `agreement_templates`, `ai_usage_log`, `app_errors`, `app_settings`, `app_users`, `attachments`, `audit_log`, `build_stages`, `build_tasks`, `build_template_items`, `build_templates`, `client_report_drafts`, `client_update_drafts`, `clients`, `company_documents`, `contract_invoices`, `contracts`, `crm`, `ctrm_client_terms`, `ctrm_deal_commissions`, `ctrm_deal_stage_changes`, `ctrm_deals`, `ctrm_fit_sheets`, `ctrm_sessions`, `customer_bookings`, `customer_documents`, `customer_payments`, `customer_refunds`, `delivery_notes`, `delivery_packages`, `digest_recipients`, `digest_runs`, `drive_connection`, `duplicate_dismissals`, `expenses`, `follow_up_updates`, `fx_rates`, `hubspot_links`, `hubspot_sync_runs`, `income`, `inventory_movements`, `invoice_reminders`, `invoices`, `legal_documents`, `legal_sign_links`, `legal_sign_pdfs`, `legal_signatures`, `line_items`, `message_templates`, `nda_templates`, `owned_domains`, `package_cost_components`, `package_selling_prices`, `payment_log`, `portal_access`, `portal_uploads`, `products`, `quotations`, `quote_accept_links`, `quote_accept_pdfs`, `quote_acceptances`, `quote_templates`, `report_calls`, `requirements`, `sales_deals`, `scheduled_departures`, `sla_policies`, `supplier_commitments`, `ticket_messages`, `tickets`, `time_entries`, `tour_packages`, `usage_import_runs`, `usage_records`, `usage_sources`, `vendors`, `wanders_deals`, `wanders_partners`, `wanders_passengers`, `wanders_terms_acceptances`, `watch_items`, `website_inquiries`, `worship_church_profiles`, `worship_setup_log`

### Local IndexedDB
`app/src/lib/localDb.ts` — subset of stores; cloud-only tables omitted. No RLS in local mode.

### Tee Tribe separate schema
`teetribe/supabase/migrations/` — commerce tables with RLS (admins, products, orders, …). Bundled SPA at `/shop`.

---

## 6. Edge Functions (API surface)

| Function | Purpose |
|----------|---------|
| `ai-assist` | Claude helpers; `ai_usage_log` |
| `bootstrap-admin` | Optional one-shot admin |
| `client-portal` | Token portal |
| `client-reports` / `client-updates` | Monthly / weekly CS send |
| `contract-invoices` | Daily draft contract invoices |
| `create-checkout-session` | Tee Tribe Stripe Checkout |
| `daily-digest` | Morning attention digest |
| `fireflies-fetch` | Meeting notes → timeline |
| `google-drive` | OAuth + folders/uploads |
| `hubspot-sync` | One-way CRM → HubSpot |
| `invoice-pay-link` / `stripe-invoice-webhook` / `payment-reminder` | Collection |
| `lead-intake` | Website/WA leads |
| `legal-sign` / `quote-accept` | Public token flows |
| `manage-auth-user` | Staff Auth admin |
| `support-email-in` / `whatsapp-in` / `whatsapp-send` | Support channels |
| `teetribe-order-sync` | Paid orders → CRM note |
| `usage-import` | Meta WA + Anthropic spend |
| `watchdog` | Stale/overdue watch list |
| `worshiphub-read` / `worshiphub-manage` | Church product |
| `zoho-proxy` | Zoho Mail + Calendar |

---

## 7. Environment variables (names only)

Client: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_ENV`, `VITE_BASE`, `VITE_RELEASE`, `VITE_CHECKOUT_API_URL`, …

Server / Edge (sample): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_*`, `HUBSPOT_*`, `WHATSAPP_*`, `META_*`, `ZOHO` via proxy secrets, `ANTHROPIC_*`, `FIREFLIES_API_KEY`, `STRIPE_*` / `RR_STRIPE_*`, `WORSHIPHUB_*`, various `*_CRON_SECRET`, `LEAD_INTAKE_SECRET`, `SUPPORT_INBOUND_SECRET`, `ALLOWED_ORIGINS`, `APP_URL`, bootstrap secrets.

**Never commit values.** CI scans Pages bundle for service_role leakage.

---

## 8. Third-party services

| Service | Status |
|---------|--------|
| Supabase | Core |
| Stripe | Invoice pay + Tee Tribe |
| Google Drive | Live (replaced WorkDrive) |
| Zoho Mail/Calendar | Live via proxy; **no Zoho CRM module sync** |
| HubSpot | One-way push |
| WhatsApp (Meta) | Tickets + digests/reminders |
| Anthropic | AI assist, reports, usage |
| Fireflies | Manual fetch |
| WorshipHub API | Products page |
| Gemini | Not in repo |
| Sentry | Not in repo |

---

## 9. Scheduled jobs

Documented `pg_cron` → Edge: usage-import, daily-digest, watchdog, contract-invoices, client-reports, client-updates, hubspot-sync.  
Browser: `useContractBillingSync` if cron stale >36h.  
GitHub Actions: nightly DB backup (`backup.yml`).

**Job runner choice (spec M0):** today = **pg_cron + Edge Functions**. Recorded in `docs/STATUS.md`; revisit if Inngest/Trigger.dev needed for multi-tenant scale.

---

## 10. Money handling

- **SQL:** `numeric(12,2)` / similar — no float money columns in RR migrations.  
- **TS:** `number` + `roundMoney` (`Math.round(n*100)/100`).  
- **Spec debt:** IEEE float in the browser; master spec requires exact `numeric` + no float for money (M1+ accounting).

---

## 11. What works (production-critical)

1. Quote → invoice → DN (+ PDF/Drive/signed)  
2. Quote accept link → Signed + draft contract  
3. Supplier invoice → expense → GP vs quote  
4. Contract auto-billing + reminders + Stripe  
5. NDA e-sign vault  
6. Support email/WhatsApp + SLA  
7. Follow-ups + Zoho Calendar  
8. Lead intake / Quick add / inquiries  
9. Accounts delivery (contracts, build, time, usage)  
10. Dashboard attention + watchdog/digest  

---

## 12. Broken / thin / technical debt

| Item | Notes |
|------|-------|
| Dual CRM | Legacy My Day `crm` vs Accounts + sales/CTRM deals |
| No multi-tenancy | Single Red Reach org; no `tenant_id` |
| Accounting | Cash-style income/expenses/payments/reports — **not** double-entry ledger |
| Inventory | SKU + manual adjust; no PO/WMS |
| HubSpot | Push only |
| Fireflies | Paste ID |
| CTRM issues | Thin ticket grouper |
| Wanders | Rich schema; less polish than Threads docs path |
| TypeScript | App not `strict: true` |
| No Arabic/RTL | English only UI strings |
| No module registry / workflows / custom fields | Hardcoded entities |
| Red Reach–specific in core | WorshipHub, Tee Tribe, Wanders, CTRM commissions mixed into shared SPA |
| History | Past service_role / dump risks noted in `docs/SECURITY.md` |
| Brand assets | Low-res division logos; no SVG; no Boost/Care/Trading; black unit labels on dark |

---

## 13. CI today

`.github/workflows/ci.yml`: app lint/typecheck/test/build/bundle scans · edge deno check · migrations + RLS tests · function-health.  
Also: Pages deploy, function deploy (manual), backup, staging DB, rollback.

**Gap vs spec M0:** no dedicated “every table has RLS policy or intentional deny-all” CI assertion beyond existing RLS tests; no CodeQL/gitleaks called out as required gates (npm audit + bundle scan exist).

---

## 14. Brand assets received (Appendix C)

Placed at repo root `brand-assets/` with `brand.json` and README. Includes company logo, Connect/Marketing/Threads/Wanders, square mark + derived PWA sizes, Tee Tribe client mark. Missing: Boost, Care, Trading, SVGs, light variants.

---

## 15. Open decisions (flag to Alfred — do not guess)

From master spec §19: product name/domain, UAE data residency, job runner long-term, pricing, e-sign level, pilot customers, AI providers, accountant/payroll/legal reviewers, Arabic reviewers, Supabase vs self-managed, demo self-serve vs presenter, fictional demo stories, Arabic in first demo.

---

*End of AUDIT.md — M0*
