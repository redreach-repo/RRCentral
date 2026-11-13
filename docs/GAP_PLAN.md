# RRCRM gap plan (M0)

**Date:** 13 November 2026 (Asia/Dubai)  
**Against:** Master Specification v1.1  
**Audit:** `docs/AUDIT.md`  
**Rule:** Keep what works. Add structures, migrate, then retire old paths. Ask before destructive migrations, auth/hosting changes, or new paid services.

Status key: **exists** · **partial** · **missing**

---

## Spec §3–5 Platform and shell

| Requirement | Status | Migration / next step |
|-------------|--------|------------------------|
| Vite+React SPA on Supabase | exists | Keep; do not rewrite framework |
| Trusted logic in Edge/DB not only browser | partial | Ledger/payroll/permissions must move server-side in M1+ |
| Zod validation everywhere | partial | Login, password, app-user, account form schemas; keep expanding forms/API |
| Module registry manifests | partial | M1 `APP_MODULES` in `modules/nav.ts`; Layout consumes manifests — flags/permissions next |
| Domain events / `event_outbox` | partial | M1 table + RLS; workers not yet consuming |
| Public REST API + webhooks | missing | M11 (or earlier for partners) |
| Exact money `numeric` / no float | partial | SQL numeric exists; TS `number`+round — fix path in M7 |
| Tenant / company / BU model | partial | M1 tables + seed + `tenant_id` retrofit; company switcher live |
| RLS on every table | exists | M1 RESTRICTIVE tenant isolation on stamped tables |
| Cross-tenant CI tests | partial | `tenant_isolation_test.sql` in `run.sh`; expand coverage next |
| Roles + record rules + field permissions | partial | Fixed 5 roles; field-mask API started (`fieldPermissions`); record rules later |
| Maker-checker | missing | M7/M8 for money/payroll |
| Customization layer (fields, pipelines, objects, workflows, templates, views, dashboards, labels, numbering) | partial | M2 layer largely in: numbering, fields, views, pipelines, workflow defs + runner (approval/notify); more step types / dashboards later |
| Industry packs | missing | M12 |
| Shell: Inbox/Sales/… areas, Cmd+K, AI button | partial | Accordion nav exists; restructure shell in M1 |
| Company switcher | partial | M1 top-bar switcher; multi-company ops still thin |
| EN+AR RTL | partial | M1 `I18nContext` + dir; catalogs incomplete |
| PWA installable | partial | Icons + maskable safe-zone from brand mark; theme `#C8321A`; still missing division logos |
| Brand kits per tenant/company/BU | partial | M1 `brand_kits` + `app/public/brand`; missing Boost/Care/Trading assets |
| In-app guide `/guide` | partial | M1 route shell; content packs later |

---

## Spec §6 Modules

| Module | Status | Notes / step |
|--------|--------|--------------|
| 6.1 Core platform | partial | Users/settings/audit/2-step exist; MFA passkeys/SSO missing → M1 |
| 6.2 CRM and sales | partial | Strong ops CRM; three pipelines; Pipeline-first soft-retire (M3 slice 4); schema merge later (ask) |
| 6.3 Email and calendar | partial | Zoho + Gmail/M365 Phase A; inbox Phase B; IMAP assessed & deferred (prefer APIs) |
| 6.4 Contracts and e-sign | partial | Agreement/NDA + `/sign` sealed PDF path; no clause library/obligations board → M5 |
| 6.5 HR | missing | M6 |
| 6.6 Payroll | missing | M8 UAE pack |
| 6.7 Accounting (ledger) | partial | Invoices/payments/expenses/reports; **no** journals/CoA/immutability → M7 |
| 6.8 Inventory and purchasing | partial | Catalog/inventory thin; DN as delivery doc → M9 |
| 6.9 Delivery (projects/support) | partial | AI CRM delivery + tickets strong; generalize projects → M3/M9 continuity |
| 6.10 Marketing | missing | M10+ / later; hashtag rules N/A today |
| 6.11 Documents and knowledge | partial | Drive + customer_documents; not full DMS → expand with M5/M11 |
| 6.12 Planning and reports | partial | Reports/MRR/insights; no goals/scenarios builder → M12-ish / planning |
| 6.13 Tenant billing | missing | Stripe today is customer invoices + Tee Tribe; SaaS Billing → M11 |
| 6.14 Demo / showcase | missing | M3a after CRM rebuild |

---

## Spec §8–10 Cross-cutting

| Requirement | Status | Step |
|-------------|--------|------|
| Mail providers (Zoho→Gmail→M365→IMAP) | partial | Zoho + Gmail/M365 Phase A; IMAP compliance concluded (deferred); Phase B inbox later |
| AI gateway + tools-as-user + pgvector | partial | `ai-assist` Edge; no gateway/retrieval/action queue → M10 (light from M4) |
| AI human approval queue | missing | M10 |
| Field-level encryption (salary, IBAN, tokens) | missing | M1 for tokens; M6/M8 for HR fields |
| Append-only audit | partial | `audit_log` exists; verify triggers block UPDATE/DELETE |
| Sentry / structured logs | missing | M0/M1 add |
| Soft delete / retention tooling | partial | Soft patterns vary; DSR tooling missing |
| Demo isolation + outbound block | missing | M3a |

---

## Spec §11–14 Localization, migration, import

| Requirement | Status | Step |
|-------------|--------|------|
| UAE VAT codes / TRN / e-invoice ready model | partial | VAT on docs; no CoA tax engine → M7 + COMPLIANCE_NOTES |
| WPS / gratuity | missing | M8 + verify law |
| Arabic bilingual PDFs | missing | M1/M7 |
| Import/export every list | partial | Some CSV; not universal → M1 framework |
| Keep RR Central workflows | exists | Must not break §B.3 during M1–M3 |

---

## Appendix B inventory gaps → plan

| Gap | Spec handling |
|-----|---------------|
| Dual CRM | M3 |
| Shallow inventory | M9 |
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
| **M4+** | As spec |

---

## Asks before proceeding past docs

1. Confirm job runner remains **pg_cron + Edge** for now (recommended).  
2. Confirm when to provision a **second Supabase project** for demo (M3a).  
3. Confirm data residency preference timing (before first external customer).  
4. Provide Boost / Care / Trading logos + SVGs + light variants when available.

---

*End of GAP_PLAN.md — M0*
