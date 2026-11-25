import { db, isSupabaseConfigured } from './db'
import { isMissingRelationError, isUndefinedColumnError } from './errors'
import { poForQuote, type DnInvoiceOption, type DnPoOption } from './deliveryNoteLinks'

type PoRow = {
  id: string
  po_number: string
  status?: string
  quotation_id?: string | null
  clients?: { company_name?: string | null } | null
  accounts?: { name?: string | null } | null
}

function toOption(r: PoRow): DnPoOption {
  return {
    id: r.id,
    po_number: r.po_number,
    status: r.status,
    quotation_id: r.quotation_id ?? null,
    client_name: r.clients?.company_name || r.accounts?.name || '',
  }
}

/** Client POs to link delivery notes to (best effort: empty when the client PO SQL is not on). */
export async function loadDnPoOptions(): Promise<DnPoOption[]> {
  if (!isSupabaseConfigured()) return []
  let res = await db
    .from('client_purchase_orders')
    .select('id, po_number, status, quotation_id, clients(company_name), accounts(name)')
    .order('issued_on', { ascending: false })
    .limit(500)
  if (res.error && isUndefinedColumnError(res.error)) {
    res = await db
      .from('client_purchase_orders')
      .select('id, po_number, status, clients(company_name), accounts(name)')
      .order('issued_on', { ascending: false })
      .limit(500)
  }
  if (res.error) {
    if (isMissingRelationError(res.error) || isUndefinedColumnError(res.error)) return []
    throw res.error
  }
  return ((res.data || []) as unknown as PoRow[]).map(toOption)
}

export async function loadDnInvoiceOptions(): Promise<DnInvoiceOption[]> {
  if (!isSupabaseConfigured()) return []
  const { data, error } = await db
    .from('invoices')
    .select('reference_number, client, status')
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) return []
  return (data || []) as DnInvoiceOption[]
}

/**
 * Links for a new delivery note made from a quote: the quote's only client
 * PO, and the invoice already made from the quote (same number). Best effort.
 */
export async function linksForNewNote(quote: { id: string; reference_number: string }): Promise<{
  client_po_id: string | null
  invoice_ref: string
}> {
  let client_po_id: string | null = null
  let invoice_ref = ''
  try {
    const { data, error } = await db
      .from('client_purchase_orders')
      .select('id, po_number, status, quotation_id')
      .eq('quotation_id', quote.id)
    if (!error) client_po_id = poForQuote(((data || []) as PoRow[]).map(toOption), quote.id)
  } catch {
    /* advisory */
  }
  try {
    if (quote.reference_number) {
      const { data } = await db
        .from('invoices')
        .select('reference_number, status')
        .eq('reference_number', quote.reference_number)
        .maybeSingle()
      const inv = data as { reference_number: string; status?: string } | null
      if (inv && inv.status !== 'Cancelled') invoice_ref = inv.reference_number
    }
  } catch {
    /* advisory */
  }
  return { client_po_id, invoice_ref }
}

/** After an invoice is made from a quote: its delivery notes not yet invoiced get the invoice number. */
export async function stampInvoiceOnQuoteNotes(quoteRef: string, invoiceRef: string): Promise<void> {
  if (!quoteRef || !invoiceRef) return
  const { error } = await db
    .from('delivery_notes')
    .update({ invoice_ref: invoiceRef })
    .eq('quote_ref', quoteRef)
    .eq('invoice_ref', '')
  if (error && !isUndefinedColumnError(error) && !isMissingRelationError(error)) throw error
}
