# HighMast gap plan (M0 refresh)

**Date:** 14 November 2026 (Asia/Dubai)  
**Against:** HighMast Master Specification **v1.2**  
**Audit:** `docs/AUDIT.md`  
**Rule:** Keep what works. Add structures, migrate, then retire old paths. Ask before destructive migrations, auth/hosting changes, or new paid services. User-facing product name is **HighMast**; repo/DB/Edge names stay RR Central for now (§0.15).

Status key: **exists** · **partial** · **missing**

---

## Spec §3–5 Platform, shell, brand

| Requirement | Status | Migration / next step |
|-------------|--------|------------------------|
| Vite+React SPA on Supabase | exists | Keep; do not rewrite framework |
| Trusted logic in Edge/DB not only browser | partial | Ledger/payroll/permissions must move server-side in M1+ |
| Zod validation everywhere | partial | Many form schemas live; keep expanding forms/API |
| Module registry manifests | partial | M1 `APP_MODULES`; Layout + Cmd+K use `visibleAppModules`; Settings Module flags card; Admin always on |
| Domain events / `event_outbox` | partial | Enqueue + worker + HubSpot/digest/webhook handlers live |
| Public REST API + webhooks | missing | M11 (or earlier for partners) |
| Exact money `numeric` / no float | partial | SQL numeric exists; TS `number`+round — fix path in M7 |
| Tenant / company / BU model | partial | M1 tables + seed + `tenant_id` retrofit; company switcher live; multi-tenant SaaS UX later |
| RLS on every table | exists | RESTRICTIVE tenant isolation on stamped tables |
| Cross-tenant CI tests | partial | `tenant_isolation_test.sql` covers CRM, finance, tickets, legal, customization, outbox + audit append-only; keep expanding |
| Roles + record rules + field permissions | partial | Fixed 5 roles; field-mask API started; record rules later |
| Maker-checker | missing | M7/M8 for money/payroll |
| Customization layer | partial | Numbering, fields, views, pipelines, workflow defs + runner (approval/notify); more step types / dashboards later |
| Industry packs | missing | M12 |
| Shell areas, Cmd+K, AI button | partial | Accordion nav + Cmd+K; restructure areas toward §5 Home/Inbox/… |
| Company switcher | partial | Top-bar switcher; multi-company ops still thin |
| EN+AR RTL | partial | `I18nContext` + dir; shell/nav + many page bodies (through domains + app errors); more bodies / bilingual PDFs later |
| PWA installable | partial | Icons + maskable safe-zone; theme `#C8321A`; division logos still missing |
| Brand kits per tenant/company/BU (§5.1) | partial | `brand_kits` + `app/public/brand` + Red Reach seed assets; Boost/Care/Trading logos missing |
| HighMast product brand (§5.2) | partial | `brand-assets/highmast/` symbol + stacked + derived marks seeded; no `PRODUCT` constant or HighMast sign-in chrome yet |
| Theme studio (§5.3) | missing | Admin branding.manage UI, OKLCH tonal scale, live preview, version history → M1 |
| In-app guide `/guide` | partial | CRM + billing + delivery + ops + finance + admin packs; more packs / AR polish later |
| No hardcoded brand (§0.15) | missing | Introduce `PRODUCT` + theme tokens; replace RR Central / Red Reach hardcodes on HighMast surfaces |

---

## Spec §6 Modules

| Module | Status | Notes / step |
|--------|--------|--------------|
| 6.1 Core platform | partial | Users/settings/audit/TOTP exist; passkeys/SSO missing → continue M1 |
| 6.2 CRM and sales | partial | Strong ops CRM; three pipelines; Pipeline-first soft-retire; schema unify → M3 (`docs/M3_CRM_UNIFY.md`) |
| 6.3 Email and calendar | partial | Zoho + Gmail Phase A + M365 Phase A/B; Gmail inbox CASA-gated; IMAP deferred → M4 |
| 6.4 Contracts and e-sign | partial | NDA `/sign` + agreement templates + clauses + obligations + spawn-on-sign; QTSP → M5 later (ask before paid) |
| 6.5 HR | missing | M6 |
| 6.6 Payroll | missing | M8 UAE pack + verify law |
| 6.7 Accounting (ledger) | partial | Invoices/payments/expenses/reports; **no** journals/CoA/immutability → M7 |
| 6.8 Inventory and purchasing | partial | Catalog/inventory thin; DN as delivery doc → M9 |
| 6.9 Delivery (projects/support) | partial | AI CRM delivery + tickets strong; generalize projects → M3/M9 continuity |
| 6.10 Marketing | missing | Later; hashtag rules N/A today |
| 6.11 Documents and knowledge | partial | Drive + customer_documents; not full DMS |
| 6.12 Planning and reports | partial | Reports/MRR/insights; no goals/scenarios builder |
| 6.13 Tenant billing | missing | Stripe today is customer invoices + Tee Tribe; SaaS Billing → M11 |
| 6.14 Demo / showcase | missing | Separate demo Supabase + synthetic data + outbound blocks → M3a (**ask Alfred** before provisioning). Private Red Reach tenant ≠ demo |

---

## Spec §8–10 Cross-cutting

| Requirement | Status | Step |
|-------------|--------|------|
| Mail providers (Zoho→Gmail→M365→IMAP) | partial | Zoho + Gmail A + M365 A/B; Gmail B later; IMAP deferred |
| AI gateway + tools-as-user + pgvector | partial | `ai-assist` Edge; no gateway/retrieval/action queue → M10 |
| AI human approval queue | missing | M10 |
| Field-level encryption (salary, IBAN, tokens) | missing | Tokens early; HR fields with M6/M8 |
| Append-only audit | partial | `audit_log` + CI REVOKE checks; prune stays security definer |
| Sentry / structured logs | missing | M0/M1 add |
| Soft delete / retention / DSR tooling | partial | Soft patterns vary; DSR tooling missing |
| Demo isolation + outbound block | missing | M3a + CI proofs |
| Honest security claims (§0.10 / §10.9) | exists (policy) | No SOC2/ISO claims until earned |

---

## Spec §11–14 Localization, migration, import

| Requirement | Status | Step |
|-------------|--------|------|
| UAE VAT codes / TRN / e-invoice ready model | partial | VAT on docs; no CoA tax engine → M7 + `COMPLIANCE_NOTES` |
| WPS / gratuity | missing | M8 + verify law |
| Arabic bilingual PDFs | missing | M1/M7 |
| Import/export every list | partial | Some CSV; not universal → M1 framework |
| Keep RR Central workflows (Appendix B.3) | exists | Must not break during M1–M3 |

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

## What must **not** become shared core code

WorshipHub admin, Tee Tribe shop, RR Wanders tour ops, CTRM commission tables → Red Reach tenant pack / connectors / custom objects (spec §B.7). Demo must not include real brands (Tee Tribe excluded). Never copy private Red Reach data into the demo (§6.14 / §13).

---

## Milestone readiness (order unchanged)

| Milestone | Blockers / notes |
|-----------|------------------|
| **M0** | Audit + gap plan refreshed for v1.2; brand-assets HighMast seed in flight; CI green |
| **M1** | Continue: theme studio, `PRODUCT` constant, HighMast surfaces, passkeys/SSO later, i18n bodies |
| **M2** | Depends on M1; expand workflow steps / dashboards / packs installer |
| **M3** | Dual/triple CRM merge; keep briefing — `docs/M3_CRM_UNIFY.md` |
| **M3a** | Separate Supabase project for demo (**ask Alfred** before provisioning) |
| **M4+** | As spec §17 |

---

## Open decisions (do not guess — §19)

Product name is decided (**HighMast**). Still open: domain, trademark clearance, data residency, job runner formalization, pricing, e-sign level, pilots, AI providers, expert reviewers, Arabic review, demo style, tenant addresses / white-label plans, default tenant look, 16 px mark review. Flag to Alfred; do not invent answers in code.

---

## Asks before proceeding past docs

1. Confirm job runner remains **pg_cron + Edge** for now (recommended).  
2. Confirm when to provision a **second Supabase project** for demo (M3a).  
3. Confirm data residency preference timing (before first external customer).  
4. Provide Boost / Care / Trading logos + HighMast SVG masters + light variants when available.

---

*End of GAP_PLAN.md — HighMast v1.2*
