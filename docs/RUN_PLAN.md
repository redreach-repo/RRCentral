# Run plan — Batch M4 through M7

**Started:** 15 November 2026 (Asia/Dubai)  
**Branch:** `cursor/batch-m4-m7-d3d5`  
**Spec:** Master Spec v2.1 (`MASTER_SPEC.md`)  
**Prior batch:** M0–M3a merged (#436)

---

## M4 — Mail and calendar

- [x] Zoho + Gmail Phase A + M365 Phase A/B already on main
- [x] IMAP remains unavailable in Settings (explicit stub + resolve tests)
- [ ] Gmail Phase B inbox — blocked on CASA (Not done)
- [ ] IMAP live adapter — deferred until a real non-API mailbox need (Not done)

## M5 — Contracts and e-sign

- [x] NDA /sign, clauses, obligations, QTSP stub already on main
- [x] Doc-type → required e-sign level matrix (honest labels; canvas stays assent)
- [ ] TDRA-licensed QTSP vendor — Alfred / paid (Not done)

## M6 — HR core

- [x] People directory + FLE + gratuity draft already on main
- [x] Leave requests table + RLS + People-adjacent Leave page
- [ ] Full attendance / org chart / contracts HR pack — later (Not done)

## M7 — Accounting core

- [x] Maker-checker / Approvals already on main
- [x] Chart of accounts + journals + balanced post + immutable posted rows
- [x] Ledger page under Finance (manager+)
- [x] Seed default CoA (UAE SME starter — Unverified for tax mapping)
- [ ] Auto-post from invoices/expenses — later deepen (Not done)
- [ ] Full VAT return engine — M7+ / COMPLIANCE (Not done)

## Quality gates

- [x] typecheck
- [x] lint (existing warnings only)
- [x] vitest (ledger, leave, esign, mailCalendar)
- [x] SQL module tests: `accounting_ledger_test` + `hr_leave_test` (+ full `run.sh`)
