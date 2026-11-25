/**
 * Delivery note -> client PO and invoice. Part of the chain
 * quotation -> PO -> delivery notes -> invoices -> payments.
 * SQL: supabase/migrations/20261330100000_delivery_note_po_invoice_link.sql.
 */

export const DELIVERY_NOTE_LINK_SQL = 'delivery-note-po-invoice-link.sql'

export type DnPoOption = {
  id: string
  po_number: string
  quotation_id?: string | null
  client_name: string
  status?: string
}

export type DnInvoiceOption = { reference_number: string; client: string; status?: string }

function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = String(a || '').trim().toLowerCase()
  return x !== '' && x === String(b || '').trim().toLowerCase()
}

/** The PO a new delivery note from this quote should point at: the quote's only linked PO, else none. */
export function poForQuote(pos: DnPoOption[], quoteId: string | null | undefined): string | null {
  if (!quoteId) return null
  const mine = pos.filter((p) => p.quotation_id === quoteId && p.status !== 'canceled')
  return mine.length === 1 ? mine[0].id : null
}

/** POs to offer on a delivery note: the quote's POs first, then the client's other open POs. */
export function poOptionsForNote(pos: DnPoOption[], client: string, quoteId?: string | null): DnPoOption[] {
  const forQuote = quoteId ? pos.filter((p) => p.quotation_id === quoteId) : []
  const forClient = pos.filter((p) => sameName(p.client_name, client) && !forQuote.includes(p) && p.status !== 'canceled')
  return [...forQuote, ...forClient]
}

/** Invoices to offer: the client's, with the one that carries the quote number first. */
export function invoiceOptionsForNote(invoices: DnInvoiceOption[], client: string, quoteRef: string): DnInvoiceOption[] {
  const live = invoices.filter((i) => i.reference_number && String(i.status || '') !== 'Cancelled')
  const sameRef = live.filter((i) => quoteRef && i.reference_number === quoteRef)
  const rest = live.filter((i) => sameName(i.client, client) && !sameRef.includes(i))
  return [...sameRef, ...rest]
}

/** The invoice a delivery note is billed on: its own link, else the invoice made from its quote (same number). */
export function noteInvoiceRef(
  note: { invoice_ref?: string | null; quote_ref?: string | null },
  invoiceRefs: Set<string>,
): string {
  const own = String(note.invoice_ref || '').trim()
  if (own) return own
  const q = String(note.quote_ref || '').trim()
  return q && invoiceRefs.has(q) ? q : ''
}

/** "PO 4200050362 · Invoice RR-01-26003" for the delivery notes list. */
export function noteChainLabel(poNumber: string | null | undefined, invoiceRef: string): string {
  return [poNumber ? `PO ${poNumber}` : '', invoiceRef ? `Invoice ${invoiceRef}` : 'Not invoiced'].filter(Boolean).join(' · ')
}
