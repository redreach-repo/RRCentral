# Run plan — Batch M8, M8a, M9, M9b, M9a

**Started:** 15 November 2026 (Asia/Dubai)  
**Branch:** `cursor/batch-m8-m9a-d3d5` (from `main`)  
**Spec:** Master Spec v2.1  
**Note:** M4–M7 merged via #437; this batch is additive on top.

---

## M8 — Payroll deepen

- [x] Runs / lines / WPS draft already on main
- [x] Export audit log (`payroll_exports`) when CSV/SIF downloaded
- [ ] Bank-certified WPS — counsel (Not done)

## M8a — India / Canada country packs

- [x] Country pack data module (AE / IN / CA) — Unverified rates/labels
- [x] Catalog page + activate sets tenant default country pack key
- [ ] Specialist sign-off of tax/payroll rules (Not done)

## M9 — Inventory / purchasing

- [x] Products + stock adjust already on main
- [x] Purchase orders + lines + receive into stock
- [ ] Full landed cost / multi-warehouse (Not done)

## M9b — Project accounting

- [x] Projects + cost lines linked to accounts
- [ ] Full WIP / retention / billing schedules (Not done)

## M9a — Client PO tracker

- [x] Client purchase orders against accounts (status + amount)
- [ ] Auto-match to invoices (Not done)

## Quality gates

- [x] typecheck / lint / vitest / SQL module tests
