# VAT / CRM fields / soft-delete / scenarios / public-api guard

Status: built and tested (draft)  
Owner: Cursor  
PR: (pending)  
Stubbed / unverified: VAT return boxes / GL peek; planning scenario assumptions (no forecast)

**Batch:** after #448 widgets/PO/fields  
**Branch:** `cursor/batch-vat-crm-fields-d3d5`

## What shipped

- VAT return stub: extra boxes (zero-rated, exempt, adjustments), optional GL VAT payable peek, period label helper, COMPLIANCE_NOTES pointer in CSV — still **Unverified / not for FTA filing**
- Account detail: Archive / Restore via soft-delete (`deleted_at`) instead of hard delete
- CRM pipeline list: custom field columns + CSV export of those fields
- Planning scenarios table + store + Planning Goals UI stub (assumptions JSON only)
- Purchase orders: Archive soft-delete from list
- `public-api` Edge Function: `installDemoGuard()` at boot

## Explicit non-claims

- VAT boxes are product drafts — see `docs/COMPLIANCE_NOTES.md`
- Scenarios hold assumptions only; no live forecast engine
