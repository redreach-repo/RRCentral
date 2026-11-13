# RRCRM status

**Last updated:** 13 November 2026 (Asia/Dubai)  
**Current milestone:** M2 Customization layer (in progress)

## Shipped this turn (M2 pipelines / workflows)

- `pipelines` + `pipeline_stages` + `workflow_definitions` / `workflow_runs`
- Settings → Pipelines (add/edit stages) and Workflows (approval chains)
- CRM board/list loads stages from DB (fallback to hardcoded)
- Seed CRM / sales / CTRM stages + sample `crm_won_approval` chain

## Already on main

- M1 tenancy / switcher / brand / i18n / guide
- M2 numbering sequences + `rr_allocate_reference` + Settings Numbering
- M2 custom fields UI + account values + seeds

## Still open

**M2 next:** saved views on list pages (if not yet merged); CRM/quote custom field surfaces; workflow runner  
**M1 leftovers:** nav → module manifests; field permissions; Zod; TS strict; PWA mark; missing logos  
**Open §19 decisions** — do not guess

## Next after M2 close

**M3** CRM unify (dual models → one).
