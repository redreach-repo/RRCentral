# RRCRM status

**Last updated:** 13 November 2026 (Asia/Dubai)  
**Current milestone:** M3 CRM unify (slice 3)

## Shipped this turn (M3 write façade)

- `patchMyDeal` + existing `moveMyDeal` as the unified Pipeline write surface
- `/deals` next-step / owner edit modal (routes to crm / sales_deals / ctrm_deals)
- Plan: `docs/M3_CRM_UNIFY.md`

## Already on main

- M0–M2 (tenancy, numbering, fields, views, pipelines, workflow runner)
- M3 slice 1 deals ↔ Accounts bridge
- M3 slice 2 unique-link backfill + nudges

## Still open

**M3 next:** retire duplicate lists / schema consolidate (**ask before destructive SQL**)  
**M1 leftovers:** nav → module manifests; field permissions; Zod; TS strict; PWA mark; missing logos  
**Open §19 decisions** — do not guess

## Next after M3 close

**M3a** demo project (ask first) · **M4** mail/calendar expansion
