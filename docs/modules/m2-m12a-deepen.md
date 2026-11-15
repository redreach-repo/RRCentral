Status: built and tested (draft)
Owner: Cursor
PR: (this batch)
Stubbed / unverified: webhook/ask_ai workflow steps, eng contractual claims, per-WH stock as source of truth

## What it does

- Workflow runner implements `update_field` + `create_record` into run context
- Engineering document register + claims (`/eng-register`)
- Soft-delete on expenses/tickets; invoices CSV export
- Planning goal actuals from invoices/deals; client PO `received_amount`
- `warehouse_stock` stub updated from inventory adjustments

## Alfred

Apply `20261306120000`–`150000`.
