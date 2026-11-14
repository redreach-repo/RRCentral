# HighMast — Repository audit (M0 refresh)

**Date:** 14 November 2026 (Asia/Dubai)  
**Authority:** HighMast Master Specification v1.2 (14 November 2026)  
**Scope:** Read-only audit of the live Red Reach operations app (still named RR Central in this repo). No product code was changed in this step.  
**Repo:** `redreach-repo/RRCentral` (Vite + React SPA, Supabase Postgres / Auth / Storage / Edge Functions, Stripe, GitHub Pages).

Product name **HighMast** (by Red Reach) is decided. This audit uses “RR Central” for the existing app and “HighMast” for the target platform. User-facing rename and a `PRODUCT` constant are **not** done yet (spec §0 rule 15 / §5.2).

---

## 1. Executive summary

RR Central is a **working single-customer operations suite** that Red Reach runs today. Capability is broad: CRM/pipelines, quotes→invoices→delivery notes, accounts/delivery/support, finance lists, Drive, WhatsApp/email intake, NDA and agreement e-sign, clause library, obligations, contract auto-billing, WorshipHub, Wanders, Tee Tribe shop, Cmd+K, module soft-hide flags, EN+AR chrome on many pages, and an event outbox.

**Platform foundations already in migrations (post–original M0):**

- `tenants` / `companies` / `business_units` / `brand_kits` with `tenant_id` stamp and restrictive tenant RLS (M1)
- Customization layer: custom fields, saved views, pipelines/stages, workflows, numbering, event outbox (M2)
- Mail connectors beyond Zoho: Gmail + M365 Edge Functions (M4 partial)
- Contracts seed: clause library, obligations, templates, public sign (M5 partial)

**Still not a full HighMast subscription platform:** no SaaS tenant billing / onboarding wizard, no HR/payroll, no double-entry ledger, no full inventory/purchasing, no theme studio as specified in §5.3, no demo environment as in §6.14, no Sentry, no field-level encryption for salaries/bank/IDs. TypeScript `strict` is on in the main app. Money in SQL is `numeric`; TypeScript still often uses `number`.

**RLS:** every public table created in `supabase/migrations` enables RLS. Cross-tenant isolation is covered by `/workspace/supabase/tests/tenant_isolation_test.sql` and CI. Deny-all (service-role only) tables include OAuth connection stores (`drive_connection`, `gmail_connection`, `m365_connection`) and `worship_setup_log`.

---

## 2. Stack and hosting

| Layer | Today |
|-------|--------|
| Web | Vite + React SPA, TypeScript `strict: true` (`/workspace/app`) |
| Auth | Supabase Auth email/password when configured; else IndexedDB **local mode** |
| DB | Supabase Postgres + RLS; migrations in CI (`/workspace/supabase/tests/run.sh`) |
| Jobs | `pg_cron` + `pg_net` → Edge Functions with cron secrets; event-outbox claim/dispatch |
| Storage | Supabase Storage; Google Drive via Edge Function |
| Hosting | GitHub Pages for SPA; Edge Functions on Supabase |
| Payments | Stripe (invoice pay links + Tee Tribe Checkout) — **not** HighMast SaaS Billing yet |
| Observability | No Sentry in repo; `app_errors` + App Errors page |
| Brand assets | `/workspace/brand-assets/redreach/` (+ Tee Tribe client mark). **No** `brand-assets/highmast/` in repo yet |

---

## 3. Auth and roles

| Piece | Behaviour |
|-------|-----------|
| Session | `/workspace/app/src/contexts/AuthContext.tsx` — Supabase session or local fake session |
| Gate | `ProtectedRoute` + `TwoStepGate`; membership via `app_users`; login limited to `@redreach.ae` |
| Roles | `admin` · `manager` · `sales` · `staff` · `viewer` (`/workspace/app/src/lib/permissions.ts`) |
| MFA | Supabase Auth TOTP required for admin/manager after password (`twoStep.ts`, `TwoStepGate`) |
| Field masks | `/workspace/app/src/lib/fieldPermissions.ts` (commission, profit, TRN, bank) |
| Admin Auth API | Edge `manage-auth-user`; optional `bootstrap-admin` |
| Not present | Passkeys, SAML/OIDC SSO, SCIM, magic-link staff login |

Local mode bypasses Postgres RLS (single-browser IndexedDB). Production expects Supabase.

---

## 4. Routes and pages

**Router:** `/workspace/app/src/App.tsx` · **Pages:** `/workspace/app/src/pages/` (52) · Shop: `/workspace/app/src/shop/`

### Public
`/` → `/login` · `/login` · `/portal` · `/accept` · `/sign` · `/shop/*` · `/teetribe` → `/shop` · `*` → `/login`

### Protected (no Layout)
`/ctrm/summary` · `/accounts/:id/report` · `/accounts/:id/fit-sheet` · `/document/:type/:id`

### Protected (Layout) — by nav area

| Area | Paths |
|------|--------|
| Overview | `/app` Dashboard · `/guide` |
| Sales | `/quick-add` · `/deals` · `/crm` · `/follow-ups` · `/sales` · `/ctrm` · `/quotations` · `/invoices` · `/delivery-notes` · `/customer-files` |
| Clients | `/accounts` · `/support` · `/support/:id` · `/ctrm-issues` · `/client-health` · `/client-reports` · `/client-updates` |
| Delivery | `/products` · `/delivery-settings` · `/build-templates` · `/agreement-template` · `/nda-template` · `/clause-library` · `/obligations` |
| Ops | `/app/wanders` · `/catalog` · `/inventory` · `/templates` · `/domains` |
| Finance | `/payments` · `/expenses` · `/vendors` · `/reports` · `/mrr` · `/insights` · `/duplicates` |
| Admin | `/settings` · `/audit-log` · `/app-errors` · `/system-check` |

**Nav source:** `/workspace/app/src/modules/nav.ts` · soft-hide flags in `app_settings.moduleFlags` via `/workspace/app/src/modules/registry.ts` (overview/sales/ops/finance/delivery/clients; **admin never soft-hidden**).

**Known routing quirks**

- Catch-all `*` always navigates to `/login` (even for signed-in users).
- Soft-hidden modules and pipeline detail soft-hide still allow deep links; pages mostly self-check with `can()`.
- Marketing site pages under `/workspace/app/src/site/` are archived (not routed).

---

## 5. Database

**Migrations:** 84 files under `/workspace/supabase/migrations/` (plus Tee Tribe commerce migration under `/workspace/teetribe/supabase/migrations/`).

### Table groups (representative)

| Group | Examples |
|-------|----------|
| Core | `app_users`, `app_settings`, `app_errors`, `audit_log`, `activity_log` |
| Platform | `tenants`, `companies`, `business_units`, `brand_kits` |
| Customization | `custom_field_*`, `saved_views`, `pipelines`, `pipeline_stages`, `workflow_*`, `numbering_sequences`, `event_outbox` |
| CRM | `crm`, `clients`, `accounts`, `account_contacts`, `account_activities`, `sales_deals`, follow-ups, inquiries |
| CTRM | `ctrm_deals`, fit sheets, sessions, client terms, issues |
| Finance docs | `quotations`, `invoices`, `delivery_notes`, `line_items`, `payment_log`, `income`, `expenses`, `vendors`, `fx_rates` |
| Delivery | `contracts`, `contract_invoices`, build templates/tasks, packages, `usage_*`, `time_entries` |
| Legal | `legal_documents`, `legal_sign_*`, `nda_templates`, `agreement_templates`, `contract_clauses`, `contract_obligations`, quote accept |
| Support | `tickets`, `ticket_messages`, `sla_policies` |
| Inventory / ops | `products`, `inventory_movements`, `quote_templates`, `owned_domains` |
| Wanders | `wanders_*`, tour packages / bookings |
| Integrations | `drive_connection`, `gmail_connection`, `m365_connection`, HubSpot sync tables, portal, digest, watch items, `ai_usage_log` |

**CI isolation:** `/workspace/supabase/tests/rls_test.sql`, `/workspace/supabase/tests/tenant_isolation_test.sql`.

---

## 6. Edge Functions

Under `/workspace/supabase/functions/`:

| Function | Purpose |
|----------|---------|
| `ai-assist` | Claude helpers; usage log |
| `bootstrap-admin` | Optional one-shot admin (secret-gated, off by default) |
| `client-portal` | Token portal |
| `client-reports` / `client-updates` | Monthly / weekly client comms |
| `contract-invoices` | Contract auto draft invoices |
| `create-checkout-session` | Tee Tribe Stripe Checkout |
| `daily-digest` | Morning digest |
| `event-outbox` | Outbox claim/dispatch |
| `fireflies-fetch` | Manual Fireflies → timeline |
| `gmail-calendar` | Gmail send + Google Calendar |
| `google-drive` | Drive OAuth and filing |
| `hubspot-sync` | One-way CRM → HubSpot |
| `invoice-pay-link` / `stripe-invoice-webhook` | Invoice Stripe pay |
| `lead-intake` | Website / WA / landing leads |
| `legal-sign` | Public NDA sign |
| `m365-mail-calendar` | Microsoft 365 mail + calendar |
| `manage-auth-user` | Admin Auth user password set |
| `payment-reminder` | Invoice reminders |
| `quote-accept` | Public quote accept |
| `support-email-in` | Inbound → tickets |
| `teetribe-order-sync` | Shop orders → CRM |
| `usage-import` | Meta WA + Anthropic spend |
| `watchdog` | Stale/overdue watch items |
| `whatsapp-in` / `whatsapp-send` | WhatsApp tickets |
| `worshiphub-manage` / `worshiphub-read` | WorshipHub product admin |
| `zoho-proxy` | Zoho Mail/Calendar CORS proxy |

---

## 7. Environment variables (names only — no values)

| Category | Names |
|----------|--------|
| Supabase (client) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| Supabase (edge) | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_RESTRICTED_KEY`, `RR_STRIPE_*`, Tee Tribe checkout keys |
| Google | `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_MAIL_CLIENT_ID/SECRET` |
| Microsoft | `MICROSOFT_CLIENT_ID/SECRET`, `MICROSOFT_TENANT_ID` |
| HubSpot | `HUBSPOT_ACCESS_TOKEN`, `HUBSPOT_CRON_SECRET` |
| Meta / WhatsApp | `WHATSAPP_*`, `META_*`, template language vars |
| AI | `ANTHROPIC_API_KEY`, `ANTHROPIC_ADMIN_KEY` |
| Other | `FIREFLIES_API_KEY`, `WORSHIPHUB_*`, many `*_CRON_SECRET` / ingress secrets |
| Zoho | Tokens in `app_settings` (no dedicated Deno secret names) |

---

## 8. Third-party services

| Service | Status |
|---------|--------|
| Supabase | Core platform |
| Stripe | Customer invoice pay + Tee Tribe; not HighMast plan billing |
| Zoho Mail/Calendar | Via proxy (dogfood) |
| Google Drive / Gmail / Calendar | Edge OAuth |
| Microsoft 365 | Edge OAuth (partial) |
| HubSpot | One-way push |
| Meta WhatsApp | Tickets + digests |
| Anthropic | AI assist / drafts |
| Fireflies | Manual fetch |
| WorshipHub | Product connector (Red Reach–specific) |
| **Missing vs §3 / §10** | Sentry, Inngest/Trigger.dev (pg_cron chosen de facto), KMS field encryption, SaaS billing |

---

## 9. What works (keep)

Core ops workflows that must keep working (spec Appendix B.3):

1. Quote → invoice → delivery note (+ Drive PDF)
2. Client quote accept → Signed deal + draft contract
3. Supplier invoice → expense → GP against quote
4. Contract auto-billing drafts → finalize / reminders / Stripe
5. NDA e-sign → stamped PDF to Drive/vault
6. Support intake (email / WhatsApp / form) + SLA + AI draft
7. Follow-up loop (queue, WhatsApp/email, calendar)
8. Lead intake → CRM / sales / CTRM

Also solid: accounts hub, permissions/field masks, audit log, system check, Cmd+K, module flags, EN+AR shell + many page bodies, outbox, tenant CI stamps, customization seeds.

---

## 10. What is partial or thin

| Area | Reality |
|------|---------|
| Multi-tenancy | Schema + RLS + single seeded Red Reach tenant; no multi-tenant SaaS UX / billing |
| Brand / theme studio | `brand_kits` table exists; §5.3 studio, HighMast `PRODUCT` constant, highmast assets missing |
| EN+AR | Shell + many pages; more page bodies and terminology still English-hardcoded |
| Dual CRM | `/crm` My Day beside `/accounts` + `/deals` / `/sales` / `/ctrm` (M3 unify still open) |
| Mail | Zoho + Gmail + M365 partial; full sync / IMAP / private labels incomplete |
| Contracts | Templates, clauses, obligations, sign — not full §6.4 (QTSP, maker-checker packs) |
| Accounting | Lists + reports over quotes/payments/expenses — **no** CoA / journals / immutability |
| Inventory | SKU / manual stock — no PO → goods-in |
| HubSpot | One-way only |
| Fireflies | Manual ID fetch |
| CTRM issues | Thin board |
| Wanders / WorshipHub / Tee Tribe | Red Reach–specific; must become pack/connector, not shared core (Appendix B.7) |
| Demo (§6.14) | Blocked on Alfred-provisioned demo Supabase / env |

---

## 11. What is missing (HighMast v1.2)

Relative to the master spec (non-exhaustive; see also `GAP_PLAN.md`):

- HighMast product brand wiring (`PRODUCT`, assets Appendix C.1, sign-in chrome)
- Theme studio as specified (§5.3) and tenant-themed PDFs/emails end-to-end
- HR, payroll (UAE pack), double-entry accounting, full inventory/purchasing
- Marketing module, planning module, full DMS
- Tenant billing (Stripe Billing), onboarding wizard, super-admin console
- Demo environment + synthetic data + outbound blocks (§6.14)
- AI gateway / action queue / pgvector retrieval as in §9
- Field-level encryption, Sentry, SOC2 evidence tooling
- Passkeys / SSO; maker-checker on payroll/payments
- Industry packs installer UX

---

## 12. Technical debt

- Dual CRM models and soft-retire paths still in flight
- Workflow runner: several step types “not implemented yet” (`workflowRunner.ts`)
- TS money as `number` vs SQL `numeric`
- Hardcoded “Red Reach” / RR Central strings in UI (conflicts with §0.15 / §5.2 until `PRODUCT` + brand kits)
- Catch-all route → login; phone shortcuts subset of desktop nav
- Original M0 AUDIT text was stale on tenancy / i18n / module registry — **this refresh supersedes it**

---

## 13. Brand assets on disk

| Path | Notes |
|------|--------|
| `/workspace/brand-assets/redreach/` | Company + Connect/Marketing/Threads/Wanders PNGs/JPGs; square mark + derived sizes |
| `/workspace/brand-assets/clients/tee-tribe.jpg` | Client only — never tenant branding; exclude from demo |
| `/workspace/brand-assets/highmast/` | **Absent** — Appendix C.1 assets not in repo yet |
| Still needed from Alfred | Boost/Care/Trading logos; SVG sources; light logo variants; colour/font confirmation |

---

## 14. Acceptance for this audit step

- [x] Routes / pages inventoried  
- [x] Tables / migrations / RLS posture summarized  
- [x] Edge Functions listed  
- [x] Auth method recorded  
- [x] Env var **names** categorized (no secrets)  
- [x] Third parties listed  
- [x] Works / partial / missing / debt called out  
- [ ] No application code changed in this step  

**Next (spec §0 step 3):** refresh `docs/GAP_PLAN.md` against HighMast Master Spec **v1.2** (current gap plan still cites v1.1). Then resume milestone work (STATUS continuous backlog / M3a blocked items as noted).
