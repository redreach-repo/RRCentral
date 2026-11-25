# Link client POs to quotations (even after expiry)

Alfred, 25 Nov 2026 (quote/CRM brief, fix 5): a client sometimes sends its PO
after the quotation's validity date. The PO must still link to that quote so
invoicing and filing follow it.

## What it does

- **Documents > Client POs > Details**: a new **Quotation** picker lists the
  client's finalized quotes in any status (Expired, Sent, Awarded, Superseded,
  Not awarded). Drafts and archived quotes are left out. "Show other clients'
  quotes" widens the list.
- If the PO is dated after the quote's valid-until date, the form says how many
  days late it is. **No revision or extension is needed**, and the quote's number,
  lines and totals stay as they are.
- **Mark quote Awarded** (ticked by default) moves the quote from Finalized,
  Sent, Accepted, Expired or Not awarded to Awarded, with the reason "Client PO
  <no>". That makes the quote's **Invoice** button appear, so an expired quote can
  now be invoiced. It also runs the same follow-ups as setting the outcome by hand:
  the activity log, the CRM stage and the stock reservation. A Superseded quote is
  linked but not awarded.
- A note goes on the quote's notes log, for example "Client PO LATE-1 linked
  (PO dated 26 Nov 2026). The PO came 6 days after this quote's validity ended
  on 20 Nov 2026. Quote marked Awarded (was Expired)."
- **Client POs list**: shows "Quote RR-01-26100 · PO came 6 days after the
  quote's validity (20 Nov 2026)" (amber when the PO came late). Search finds POs
  by quote number. The CSV has `quote_reference` and `after_quote_expiry`.
- **Quotations list**: shows "Client PO 4200050362" under the quote number.
- **Invoice from the quote**: the invoice notes get "Client PO No.: 4200050362",
  and the PO is matched to the new invoice.
- **Invoice > Bill against a client PO**: the PO picker shows each PO's quote,
  and the chosen PO's quote link is shown.
- **Google Drive**: a PO filed after linking is named
  "PO <no> - Quote <ref> - <file>". A PO filed earlier is renamed when its quote
  is linked (the `relabel` action of `client-po-file`).

## Database

Migration `20261330090000_client_po_quote_link.sql` (copy: project file
`supabase-sql/client-po-quote-link.sql`):

- On `client_purchase_orders`: `quote_reference`, `quote_valid_until`,
  `quote_linked_at` and `quote_linked_by`, plus the generated `after_quote_expiry`.
  `quotation_id` already existed.
- `rr_client_po_link_quote(po, quote, award)` and `rr_client_po_unlink_quote(po)`.
  Both are security invoker: admin, manager and sales can use them; viewer, staff,
  strangers and other tenants cannot. AI keys need the admin scope.
- No existing data is changed. The migration is safe to re-run.

## Setup after merge

1. Run `client-po-quote-link.sql` in the Supabase SQL editor.
2. Deploy `client-po-file` (Actions > Deploy Edge Functions). This is only needed
   for the quote number in Drive file names. Linking works without it.

## Delivery notes to the PO and invoice (step 2)

Migration `20261330100000_delivery_note_po_invoice_link.sql` (project file
`supabase-sql/delivery-note-po-invoice-link.sql`) adds `delivery_notes.client_po_id`
and `delivery_notes.invoice_ref`. A trigger, running as the person, only lets a
note point at a PO that person can see in the same company.

- A delivery note made from a quote takes the quote's client PO when the quote
  has exactly one. If the invoice was already made from the quote, the note
  takes that invoice number too.
- When **Invoice** is used on a quote, that quote's delivery notes that are not
  yet invoiced get the invoice number.
- **Delivery notes > Edit** has **Client PO** and **Invoice** pickers. The list
  shows "PO … · Invoice …" (or "Not invoiced"), search finds notes by PO or
  invoice number, and the CSV has `client_po` and `invoice_ref`.
- Before the SQL is run, saving still works and the links are skipped.
