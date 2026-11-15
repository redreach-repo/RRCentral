# Numbering pad / CSV / DSR / guide deepen

Status: built and tested (draft)  
Owner: Cursor  
PR: #450  
Stubbed / unverified: none in this batch (DSR prune remains destructive by design)

**Batch:** after #449  
**Branch:** `cursor/batch-numbering-csv-dsr-d3d5`

## What shipped

- Settings numbering: Pad column + Edit pad (2–6) for all sequences; prefix edit still PO/expense only
- CSV export on Delivery notes, Domains, Marketing campaigns, Payments (selected booking), Follow-ups, Approvals
- DSR page: notes field, Export CSV, confirm before retention prune, retention run history
- Guide packs: admin → Data subject requests; ops → Purchase orders (EN + AR)
- Support tickets: Show archived + Archive/Restore (soft-delete)
- Delivery notes: Show archived + Archive/Restore (soft-delete)

## Explicit non-claims

- Retention prune still deletes aged app_errors / audit per `rr_retention_run` policy
- Marketing CSV is campaign planning only — live ESP remains blocked
