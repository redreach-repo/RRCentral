# HighMast Master Specification — Version 2.1 (condensed authority)

**Product:** HighMast (by Red Reach)  
**Authority date:** 15 November 2026 (Asia/Dubai)  
**Owner:** Alfred S. Varghese  
**Repo pointer:** `docs/SPEC_POINTER.md`  

This file is the **single source of truth** for product behaviour in this repository. The full narrative Master Spec v2.1 lives with the product owner; Cursor agents treat this condensed document plus `docs/GAP_PLAN.md`, `docs/AUDIT.md`, and milestone notes as binding. When a detail is missing here, prefer the safest reversible default and log it in `docs/DECISIONS.md` / `docs/QUESTIONS.md`.

---

## 0. Working rules (always)

1. **Audit first** — refresh `docs/AUDIT.md` before large platform changes.
2. **Gap plan** — keep `docs/GAP_PLAN.md` honest against this spec.
3. **Keep what works** — Appendix B.3 Red Reach workflows must keep working during M1–M3.
4. **Additive migrations only** in autonomous runs — no DROP of live tables/columns; record retirement in `docs/MIGRATIONS.md`.
5. **Never production** for experiments; never commit secrets; never log salaries, bank details, ID numbers, or email bodies.
6. **No hardcoded brand** — product name from `PRODUCT` (`app/src/lib/product.ts`). Tenant chrome from brand kits after sign-in.
7. **Honest claims** — compliance data Unverified until specialist sign-off; record sources in `docs/COMPLIANCE_NOTES.md`.
8. **Tests as you go** — typecheck, lint, unit/integration, RLS tenant isolation, a11y for new screens, light + dark.
9. **Demo data with every module from M3a** — fictional only; no real client brands (Tee Tribe excluded from demo).
10. **Country rules as data packs** (§12); industry rules as packs on the customization layer (§4.5 / §11).

---

## 1. Product identity

| Token | Value |
|-------|--------|
| Name | HighMast |
| Endorsement | by Red Reach |
| Colours | red `#C8321A`, orange `#E8872A`, charcoal `#1A1A1A`, grey `#6E6E6E`, warm grey `#B8B2AC`, paper `#F7F4F1` |
| Stack | Vite, React, TypeScript strict, Supabase (Postgres, Auth, Storage, Edge Functions), Stripe |
| First markets | UAE / GCC, India, Canada |

Version roadmap (§5.7): **v1** web + per-tenant installable PWA · **v3** multi-language · **v6** native apps (M14, after first paying customers).

---

## 2. Platform core (M1)

- Multi-tenant model: `tenants` → `companies` → `business_units` + `brand_kits`.
- Every stamped table: `tenant_id` + RLS RESTRICTIVE isolation; CI proves cross-tenant deny.
- Roles: `admin` · `manager` · `sales` · `staff` · `viewer` (+ record/field rules over time).
- Module registry / flags drive nav; Cmd+K; company / BU switcher; EN+AR RTL skeleton.
- Event outbox + trusted server logic for money/permissions over time.
- Field-level encryption for tokens / salary / IBAN (progressive).
- PWA / app identity (§5.6): after sign-in, manifest follows company brand; per-host manifests later (M11).

**Accept when:** a second tenant cannot read Red Reach rows; PRODUCT constant is sole product name; light/dark brand tokens render; typecheck/lint/tests green.

---

## 3. Customization layer (M2)

Admin-configurable without code: custom fields, pipelines/stages, saved views, numbering sequences, workflow definitions (approval/notify), terminology/labels, industry pack activation → `moduleFlags`.

**Accept when:** admin can add a field, a pipeline stage, and an approval step without a deploy; pack activate enables flags without wiping tenant data.

---

## 4. CRM rebuild (M3)

One sales hub of record. Keep My Day `/crm`, Pipeline `/deals`, sales + CTRM detail routes until a dedicated destructive cutover. Soft-retire lists, write façade, read-model view `pipeline_deals_v` are in. Schema DROP is **out of band** (ask / separate PR).

**Accept when:** Pipeline board shows all open deals; next-step / owner updates persist; §B.3 workflows still pass regression; no silent DROP.

---

## 5. Demo / showcase (M3a)

Separate Supabase project (Alfred provisions). Fictional Falcon Bay story. Outbound hard-blocked (browser + Edge). Banner on every page. Guided tour + demo role switcher (UI). Presenter reset script. No production PII, no Tee Tribe, no live payments/QTSP.

**Accept when (code-side):** demo build refuses live Supabase URL; fetch/Edge guards block outbound; seed refuses without flag and on non-empty finance DB; tour + role switcher work in `VITE_APP_ENV=demo`; reset SQL documented.  
**Accept when (ops):** Alfred has provisioned demo project + secrets + deploy — recorded as Not done until then.

---

## 6. Later milestones (out of this batch)

| Milestone | Scope |
|-----------|--------|
| M4 | Email + calendar (Zoho → Gmail → M365 → IMAP) |
| M5 | Contracts + e-sign / QTSP path |
| M6–M8 | HR, accounting ledger, payroll (+ India/Canada packs M8a) |
| M9–M9a | Inventory, project accounting, client PO |
| M10–M11 | AI layer, SaaS billing, sign-up provisioner, app identity remainder |
| M12* | Industry packs (shared / Eng / Construction / Trading / Logistics) |
| M13 | Hardening + compliance |
| M14 | Native v6 |

---

## 7. Appendix B.3 — must keep working

Accounts, My Day CRM, quotes → invoices → delivery notes, follow-ups, Drive folders, tickets/WhatsApp intake, NDA e-sign, contract billing, payments/expenses lists, CTRM + commissions, Wanders, WorshipHub, Tee Tribe shop (ops tenant only — not demo).

---

## 8. Open decisions (§19) — autonomous defaults

| Topic | Default this run | Change later |
|-------|------------------|--------------|
| Job runner | Keep `pg_cron` + Edge | Swap to queue worker behind same outbox |
| Demo project | Alfred provisions; code ready | Wire deploy workflow when URL exists |
| Presenter vs self-serve | Presenter tools in demo build; self-serve rate limits later | Spec §19 |
| Data residency | Document preference before first external customer | §19 |
| Schema merge of CRM tables | Soft-retire only; no DROP | Dedicated cutover PR |
| Native apps | Do not start before M14 | Spike §19.29 |

Full decision log: `docs/DECISIONS.md`. Questions: `docs/QUESTIONS.md`.
