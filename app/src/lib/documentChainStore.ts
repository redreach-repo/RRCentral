import { db, isSupabaseConfigured } from './db'
import {
  assembleChain,
  quoteBase,
  type ChainDn,
  type ChainInvoice,
  type ChainPayment,
  type ChainPo,
  type ChainQuote,
  type ChainStart,
  type DocumentChain,
} from './documentChain'

/**
 * Loads the whole chain around one document. Every step is best effort: a
 * link whose SQL is not on the database yet (or a table the role cannot read)
 * just adds nothing, so the panel always opens.
 */

type Row = Record<string, unknown> & { id: string; deleted_at?: string | null }

async function rows<T extends Row>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await query
    if (error) return []
    return ((data || []) as T[]).filter((r) => !r.deleted_at)
  } catch {
    return []
  }
}

const nonEmpty = (xs: (string | null | undefined)[]) => [...new Set(xs.map((x) => String(x || '').trim()).filter(Boolean))]

export async function loadDocumentChain(start: ChainStart): Promise<DocumentChain> {
  const empty: DocumentChain = { client: '', quotes: [], pos: [], dns: [], invoices: [], payments: [] }
  if (!isSupabaseConfigured()) return empty

  // 1. Seeds from the document the person opened.
  let quotes: ChainQuote[] = []
  let pos: ChainPo[] = []
  let dns: ChainDn[] = []
  let invoices: ChainInvoice[] = []
  let client = ''

  if (start.kind === 'quote') {
    quotes = await rows<ChainQuote & Row>(db.from('quotations').select('*').eq('id', start.id))
  } else if (start.kind === 'po') {
    pos = await rows<ChainPo & Row>(db.from('client_purchase_orders').select('*').eq('id', start.id))
    const qid = pos[0]?.quotation_id
    if (qid) quotes = await rows<ChainQuote & Row>(db.from('quotations').select('*').eq('id', qid))
  } else if (start.kind === 'dn') {
    dns = await rows<ChainDn & Row>(db.from('delivery_notes').select('*').eq('id', start.id))
    const dn = dns[0]
    if (dn?.quote_ref) quotes = await rows<ChainQuote & Row>(db.from('quotations').select('*').eq('reference_number', dn.quote_ref))
    if (dn?.client_po_id) pos = await rows<ChainPo & Row>(db.from('client_purchase_orders').select('*').eq('id', dn.client_po_id))
    if (!quotes.length && pos[0]?.quotation_id) {
      quotes = await rows<ChainQuote & Row>(db.from('quotations').select('*').eq('id', pos[0].quotation_id))
    }
  } else {
    invoices = await rows<ChainInvoice & Row>(db.from('invoices').select('*').eq('id', start.id))
    const ref = invoices[0]?.reference_number
    if (ref) quotes = await rows<ChainQuote & Row>(db.from('quotations').select('*').eq('reference_number', ref))
    pos = await rows<ChainPo & Row>(db.from('client_purchase_orders').select('*').eq('invoice_id', start.id))
    if (ref) dns = await rows<ChainDn & Row>(db.from('delivery_notes').select('*').eq('invoice_ref', ref))
    if (!quotes.length) {
      const qid = pos.find((p) => p.quotation_id)?.quotation_id
      const qref = dns.find((d) => d.quote_ref)?.quote_ref
      if (qid) quotes = await rows<ChainQuote & Row>(db.from('quotations').select('*').eq('id', qid))
      else if (qref) quotes = await rows<ChainQuote & Row>(db.from('quotations').select('*').eq('reference_number', qref))
    }
  }

  // 2. The quote and all its revisions (same base number).
  const base = quotes[0] ? quoteBase(quotes[0]) : ''
  if (base) {
    const [byBase, byRef] = await Promise.all([
      rows<ChainQuote & Row>(db.from('quotations').select('*').eq('base_reference', base)),
      rows<ChainQuote & Row>(db.from('quotations').select('*').eq('reference_number', base)),
    ])
    quotes = [...quotes, ...byBase, ...byRef].filter((q) => quoteBase(q) === base)
  }
  client = String(quotes[0]?.client || (invoices[0] as { client?: string } | undefined)?.client || '')
  const quoteIds = nonEmpty(quotes.map((q) => q.id))
  const quoteRefs = nonEmpty(quotes.map((q) => q.reference_number))

  // 3. Client POs of those quotes.
  if (quoteIds.length) {
    pos = [...pos, ...(await rows<ChainPo & Row>(db.from('client_purchase_orders').select('*').in('quotation_id', quoteIds)))]
  }
  const poIds = nonEmpty(pos.map((p) => p.id))

  // 4. Delivery notes: by quote number, or by PO.
  const [dnByQuote, dnByPo] = await Promise.all([
    quoteRefs.length ? rows<ChainDn & Row>(db.from('delivery_notes').select('*').in('quote_ref', quoteRefs)) : Promise.resolve([]),
    poIds.length ? rows<ChainDn & Row>(db.from('delivery_notes').select('*').in('client_po_id', poIds)) : Promise.resolve([]),
  ])
  dns = [...dns, ...dnByQuote, ...dnByPo]

  // 5. Invoices: same number as a quote, named on a delivery note, matched or drawn down on a PO.
  const drawdowns = poIds.length
    ? await rows<Row & { invoice_id: string }>(db.from('client_po_drawdowns').select('id, invoice_id').in('po_id', poIds))
    : []
  const invoiceIds = nonEmpty([...pos.map((p) => p.invoice_id), ...drawdowns.map((d) => d.invoice_id)])
  const invoiceRefs = nonEmpty([...quoteRefs, ...dns.map((d) => d.invoice_ref)])
  const [invByRef, invById] = await Promise.all([
    invoiceRefs.length ? rows<ChainInvoice & Row>(db.from('invoices').select('*').in('reference_number', invoiceRefs)) : Promise.resolve([]),
    invoiceIds.length ? rows<ChainInvoice & Row>(db.from('invoices').select('*').in('id', invoiceIds)) : Promise.resolve([]),
  ])
  invoices = [...invoices, ...invByRef, ...invById]

  // 6. Payments against those invoices.
  const paidRefs = nonEmpty(invoices.map((i) => i.reference_number))
  const payments = paidRefs.length
    ? await rows<ChainPayment & Row>(db.from('payment_log').select('id, invoice_ref, amount, created_at, method').in('invoice_ref', paidRefs))
    : []

  return assembleChain({ client, quotes, pos, dns, invoices, payments })
}
