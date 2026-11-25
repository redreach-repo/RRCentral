/**
 * The document chain: quotation (and its revisions) -> client PO -> delivery
 * notes -> invoices -> payments. Pure assembly and summary; the loading is in
 * documentChainStore.ts. Links used:
 *   quote revisions    same base_reference
 *   PO -> quote        client_purchase_orders.quotation_id (#707)
 *   DN -> quote        delivery_notes.quote_ref
 *   DN -> PO / invoice delivery_notes.client_po_id / invoice_ref (#708)
 *   invoice -> quote   invoice made from the quote keeps the quote's number
 *   invoice -> PO      client_purchase_orders.invoice_id, client_po_drawdowns
 *   payment -> invoice payment_log.invoice_ref
 */
import { compare, moneyOrZero, sub, sum, toNumber, zero } from './money/index'

export type ChainStart = { kind: 'quote' | 'po' | 'dn' | 'invoice'; id: string }

export type ChainQuote = {
  id: string
  reference_number: string
  quote_id?: string
  status: string
  date?: string | null
  valid_until?: string | null
  amount?: number | null
  revision?: number | null
  base_reference?: string | null
  client?: string
}
export type ChainPo = {
  id: string
  po_number: string
  issued_on?: string | null
  amount?: number | null
  currency?: string | null
  status?: string
  quotation_id?: string | null
  invoice_id?: string | null
  after_quote_expiry?: boolean | null
  file_url?: string | null
}
export type ChainDn = {
  id: string
  reference_number: string
  date?: string | null
  status?: string
  quote_ref?: string
  client_po_id?: string | null
  invoice_ref?: string | null
}
export type ChainInvoice = {
  id: string
  reference_number: string
  date?: string | null
  amount?: number | null
  currency?: string | null
  status?: string
  payment_status?: string
}
export type ChainPayment = {
  id: string
  invoice_ref: string
  amount: number
  created_at?: string | null
  method?: string
}

export type DocumentChain = {
  client: string
  quotes: ChainQuote[]
  pos: ChainPo[]
  dns: ChainDn[]
  invoices: ChainInvoice[]
  payments: ChainPayment[]
}

export type ChainSummary = {
  invoiced: number
  paid: number
  balance: number
  /** Plain-words gaps, e.g. "No client PO linked yet". */
  gaps: string[]
}

function uniqBy<T>(rows: T[], key: (r: T) => string): T[] {
  const seen = new Set<string>()
  return rows.filter((r) => {
    const k = key(r)
    if (!k || seen.has(k)) return false
    seen.add(k)
    return true
  })
}

const byDate = <T extends { date?: string | null }>(a: T, b: T) => String(a.date || '').localeCompare(String(b.date || ''))

/** De-duplicated, in chain order: quotes by revision, the rest oldest first. */
export function assembleChain(raw: DocumentChain): DocumentChain {
  return {
    client: raw.client,
    quotes: uniqBy(raw.quotes, (q) => q.id).sort(
      (a, b) => (Number(a.revision) || 0) - (Number(b.revision) || 0) || byDate(a, b),
    ),
    pos: uniqBy(raw.pos, (p) => p.id).sort((a, b) => String(a.issued_on || '').localeCompare(String(b.issued_on || ''))),
    dns: uniqBy(raw.dns, (d) => d.id).sort(byDate),
    invoices: uniqBy(raw.invoices, (i) => i.id).sort(byDate),
    payments: uniqBy(raw.payments, (p) => p.id).sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''))),
  }
}

/** The quote base number for revisions: base_reference, else the number without "-R1" / "_revision 1". */
export function quoteBase(q: Pick<ChainQuote, 'base_reference' | 'reference_number'>): string {
  const base = String(q.base_reference || '').trim()
  if (base) return base
  return String(q.reference_number || '')
    .trim()
    .replace(/(_revision\s+\d+|-R\d+)$/i, '')
}

/** The quote whose number a PO, delivery note or invoice follows: the live (non-superseded) latest revision. */
export function liveQuote(quotes: ChainQuote[]): ChainQuote | null {
  const live = quotes.filter((q) => q.status !== 'Superseded' && q.status !== 'Draft')
  const pool = live.length ? live : quotes
  return pool.length ? pool[pool.length - 1] : null
}

export function summarizeChain(chain: DocumentChain): ChainSummary {
  const live = chain.invoices.filter((i) => i.status !== 'Cancelled')
  const cur = 'AED'
  const invoiced = sum(live.map((i) => moneyOrZero(i.amount, cur)), cur)
  const liveRefs = new Set(live.map((i) => i.reference_number))
  const paid = sum(chain.payments.filter((p) => liveRefs.has(p.invoice_ref)).map((p) => moneyOrZero(p.amount, cur)), cur)
  const balance = sub(invoiced, paid)
  const gaps: string[] = []
  const lq = liveQuote(chain.quotes)
  if (chain.quotes.length && !chain.pos.length) gaps.push('No client PO linked yet')
  if (lq && !['Awarded', 'Superseded'].includes(lq.status) && chain.pos.length) {
    gaps.push(`Quote ${lq.reference_number} is ${lq.status}, not Awarded`)
  }
  if ((chain.quotes.length || chain.pos.length) && !chain.dns.length) gaps.push('No delivery note yet')
  if (chain.dns.length && !live.length) gaps.push('Delivered but not invoiced yet')
  const uninvoicedDns = chain.dns.filter((d) => !String(d.invoice_ref || '').trim() && !(d.quote_ref && liveRefs.has(d.quote_ref)))
  if (live.length && uninvoicedDns.length) {
    gaps.push(`${uninvoicedDns.length} delivery note${uninvoicedDns.length === 1 ? '' : 's'} not on an invoice`)
  }
  if (live.length && compare(balance, zero(cur)) > 0) gaps.push('Payment still owed')
  return { invoiced: toNumber(invoiced), paid: toNumber(paid), balance: toNumber(balance), gaps }
}

/** Where each document opens. */
export function chainHref(kind: 'quote' | 'invoice' | 'dn', id: string): string {
  return `/document/${kind === 'dn' ? 'delivery-note' : kind}/${id}`
}
