# HighMast gap plan (M0)

**Date:** 15 November 2026 (Asia/Dubai)  
**Against:** Master Specification **v2.1**  
**Audit:** `docs/AUDIT.md`  
**Pointer:** `docs/SPEC_POINTER.md`  
**Rule:** Keep what works. Add structures, migrate, then retire old paths. Ask before destructive migrations, auth/hosting changes, or new paid services.

Status key: **exists** · **partial** · **missing**

---

## Spec §3–5 Platform and shell

| Requirement | Status | Migration / next step |
|-------------|--------|------------------------|
| Vite+React SPA on Supabase | exists | Keep; do not rewrite framework |
| Trusted logic in Edge/DB not only browser | partial | Ledger/payroll/permissions must move server-side in M1+ |
| Zod validation everywhere | partial | Login, password, app-user, account, ticket form schemas; keep expanding forms/API |
| Module registry manifests | partial | M1 `APP_MODULES`; Layout + Cmd+K use `visibleAppModules`; Settings Module flags card (`overview`, `sales`, `ops`, `finance`, `delivery`, `clients`); Admin stays always on; more polish later |
| Domain events / `event_outbox` | partial | M1 enqueue + worker + HubSpot/digest/webhook handlers; digest + HubSpot nudge consumption live |
| Public REST API + webhooks | partial | M11: reads + account/invoice/quotation writes + HMAC webhooks + `webhook-retry`; line items / finalize later |
| Exact money `numeric` / no float | partial | SQL numeric exists; TS `number`+round — fix path in M7 |
| Tenant / company / BU model | partial | M1 tables + seed + `tenant_id` retrofit; company switcher live |
| RLS on every table | exists | M1 RESTRICTIVE tenant isolation on stamped tables |
| Cross-tenant CI tests | partial | `tenant_isolation_test.sql` covers CRM, vendors, accounts, quotations, invoices, sales_deals, expenses, delivery_notes, payment_log, contracts, tickets, ctrm_deals, legal_documents, owned_domains, customer_documents, products, inventory_movements, quote_templates, income, follow_up_updates, supplier_commitments, saved_views, pipelines, pipeline_stages, custom_field_definitions, custom_field_values, numbering_sequences, brand_kits, business_units, workflow_definitions, workflow_runs, event_outbox + audit append-only; keep expanding stamped tables |
| Roles + record rules + field permissions | partial | Fixed 5 roles; field-mask API started (`fieldPermissions`); record rules later |
| Maker-checker | partial | M7: Approvals queue; payroll, expenses, refunds, supplier commitments ≥ AED 5k wired |
| Customization layer (fields, pipelines, objects, workflows, templates, views, dashboards, labels, numbering) | partial | M2 layer largely in: numbering, fields, views, pipelines, workflow defs + runner (approval/notify); more step types / dashboards later |
| Industry packs | partial | M12: catalog + activate enables moduleFlags; deeper object templates later |
| Shell: Inbox/Sales/… areas, Cmd+K, AI button | partial | Accordion nav exists; restructure shell in M1 |
| Company switcher | partial | M1 top-bar switcher; multi-company ops still thin |
| EN+AR RTL | partial | M1 `I18nContext` + dir; guide + shell/nav + sales/finance/clients/admin/ops/delivery list chrome (Dashboard → Domains through Wanders, Settings/Account, CTRM weekly summary, ticket + account detail, CTRM fit sheet, quote/invoice/DN viewer, legal e-sign + quote-accept + client portal + monthly client report + Wanders tour-ops + monthly reports + weekly updates queue + client health + module-flags Settings card + CTRM issues + obligations board + clause library + NDA template + build templates + agreement template + domains + app errors + Settings section chrome); more page bodies later |
| PWA / app identity §5.6 | partial | After sign-in manifest + `tenant_app_identities` table; still need per-host served manifests / DNS |
| Native apps §5.7 / M14 | missing | v6 only — spike later; do not start without Alfred |
| Brand kits per tenant/company/BU | partial | M1 `brand_kits` + Theme studio + top-bar BU chrome switch; missing Boost/Care/Trading SVG assets |
| In-app guide `/guide` | partial | CRM + billing + delivery + ops + finance + admin packs live (`GUIDE_PACKS`); more packs / AR polish later |
| Sign-up + provisioner §6.13.1–2 | partial | M11: `/workspace-setup` + `business_type_packs` + idempotent Edge scaffold; auth user create later |
| Engineering pack §11.3 | partial | Templates on activate (fields/pipelines); shared foundation M12a later |
| Construction pack §11.4 | partial | Templates on activate; workforce/site objects M12b later |
| Trading pack §11.2 light | partial | `trading_import` starter exists; landed cost / credit limits later |
| Languages §5.5 (v3) | partial | EN+AR only; all new strings must stay key-based for v3 |
| Country packs §12 | partial | AE/IN/CA catalog + activate shipped (Unverified); residency §19 |

---

## Spec §6 Modules

| Module | Status | Notes / step |
|--------|--------|--------------|
| 6.1 Core platform | partial | Users/settings/audit/2-step exist; MFA passkeys/SSO missing → M1 |
| 6.2 CRM and sales | partial | Strong ops CRM; three pipelines; Pipeline-first soft-retire (M3 slice 4); schema merge later (ask) |
| 6.3 Email and calendar | partial | Zoho + Gmail Phase A + M365 Phase A/B (incl. inbox); Gmail inbox still CASA-gated; IMAP deferred |
| 6.4 Contracts and e-sign | partial | NDA `/sign` + clauses + obligations board + spawn-on-sign; QTSP → M5 later |
| 6.5 HR | partial | People + leave requests; attendance/org chart later |
| 6.6 Payroll | partial | M8: runs + WPS/gratuity draft + `payroll_exports` audit (not legal advice / not bank-certified) |
| 6.7 Accounting (ledger) | partial | CoA + journals + post/immutability shipped; auto-post from invoices + VAT return later |
| 6.8 Inventory and purchasing | partial | M9: POs + receive→stock; landed cost / multi-warehouse later |
| 6.9 Delivery (projects/support) | partial | M9b: `delivery_projects` + cost lines; WIP/retention later |
| 6.10 Marketing | partial | M10: campaigns + consent + segments + recipients (no live ESP) |
| 6.11 Documents and knowledge | partial | Drive + customer_documents; not full DMS → expand with M5/M11 |
| 6.12 Planning and reports | partial | Reports/MRR/insights; no goals/scenarios builder → M12-ish / planning |
| 6.13 Tenant billing | partial | M11: `tenant_subscriptions` + plan catalog + Stripe Checkout/portal (`saas-checkout`); Tax registration later |
| 6.14 Demo / showcase | partial | Code-side isolation + seed/tour/role switcher; Alfred still provisions demo project |

---

## Spec §8–10 Cross-cutting

| Requirement | Status | Step |
|-------------|--------|------|
| Mail providers (Zoho→Gmail→M365→IMAP) | partial | Zoho + Gmail Phase A + M365 Phase A/B; Gmail Phase B later; IMAP deferred |
| AI gateway + tools-as-user + pgvector | partial | `hm-ai-gateway` + FTS knowledge docs; pgvector / tools-as-user later |
| AI human approval queue | partial | Queue + account Suggest button; Alfred SQL/Edge deploy still needed |
| Field-level encryption (salary, IBAN, tokens) | missing | M1 for tokens; M6/M8 for HR fields |
| Append-only audit | partial | `audit_log` exists; CI asserts authenticated cannot INSERT/UPDATE/DELETE (REVOKE); prune stays security definer |
| Sentry / structured logs | partial | Built behind DSN (off until Alfred); App errors + structured Edge logs |
| Soft delete / retention tooling | partial | M13: DSR log + prune wrapper + contact anonymize; broader soft-delete later |
| Demo isolation + outbound block | partial | Browser + Edge guards + seed; demo cloud project + deploy workflow still Alfred |

---

## Spec §11–14 Localization, migration, import

| Requirement | Status | Step |
|-------------|--------|------|
| UAE VAT codes / TRN / e-invoice ready model | partial | VAT on docs; no CoA tax engine → M7 + COMPLIANCE_NOTES |
| WPS / gratuity | partial | M8 draft CSV + SIF + export audit; **verify law + bank** before live use |
| Client PO tracker | partial | M9a table + UI; invoice auto-match later |
| Arabic bilingual PDFs | partial | Bilingual document toggle shipped; native review later |
| Import/export every list | partial | M13 `listIo` CSV framework + Accounts export; more lists later |
| Keep RR Central workflows | exists | Must not break §B.3 during M1–M3 |

---

## Appendix B inventory gaps → plan

| Gap | Spec handling |
|-----|---------------|
| Dual CRM | M3 |
| Shallow inventory | M9 (PO receive shipped; warehouse later) |
| Domains tracker | Stay custom object; optional registrar later |
| HubSpot one-way | Optional connector once CRM is hub (§14) |
| Fireflies manual | M10 webhook ingest |
| CTRM issues thin | Custom object / ticket types (M2) |
| Wanders polish | Red Reach pack / custom objects — not core |
| No Zoho CRM sync | Product is hub of record |
| AI growing | M10 |
| Staff thin surface | Role packs M1/M2 |

---

## What exists that must **not** become shared core code

WorshipHub admin, Tee Tribe shop, RR Wanders tour ops, CTRM commission tables → Red Reach tenant pack / connectors / custom objects (spec §B.7). Demo must not include real brands (Tee Tribe excluded).

---

## Milestone readiness (order unchanged)

| Milestone | Blockers from audit |
|-----------|---------------------|
| **M0** | This audit + gap plan + brand-assets + STATUS; CI already largely green; app `strict` enabled in a later M1 leftover |
| **M1** | Largest: `tenant_id` retrofit, RLS rewrite, shell, branding, i18n skeleton |
| **M2** | Depends on M1 |
| **M3** | Dual/triple CRM merge; keep briefing — see `docs/M3_CRM_UNIFY.md` |
| **M3a** | Separate Supabase project for demo (ask Alfred before provisioning) |
| **M4+** | As spec (M11 includes §6.13 form + §5.6 host manifests; M12a/b Eng/Construction; M14 native v6) |

---

## Asks before proceeding past docs

Defaults applied in `docs/DECISIONS.md` / `docs/QUESTIONS.md` for this batch:

1. Job runner remains **pg_cron + Edge** (D1).  
2. Second Supabase demo project waits on Alfred (D2 / Q1).  
3. Data residency preference deferred until before first external customer (Q3).  
4. Boost / Care / Trading logos still waiting on zip (Q5).  
5. Workspace / PWA host domain: partial after-sign-in brand; remainder M11 (Q4).  
6. Native build only after M14 spike (§19.29).

---

*End of GAP_PLAN.md — against Master Spec v2.1*
