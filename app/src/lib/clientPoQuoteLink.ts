/**
 * Linking a client PO to its quotation, in any status, even after the quote
 * has expired (a client often sends the PO late). Pure rules; the database
 * work is rr_client_po_link_quote (supabase/migrations/20261330090000_client_po_quote_link.sql).
 */

export const CLIENT_PO_QUOTE_LINK_SQL = 'client-po-quote-link.sql'

/** Quote statuses that are marked Awarded when a PO is linked (and "Mark Awarded" is ticked). */
export const AWARDABLE_ON_PO = ['Finalized', 'Sent', 'Accepted', 'Expired', 'Not awarded'] as const

export type LinkableQuote = {
  id: string
  client: string
  reference_number: string
  quote_id?: string
  status: string
  date?: string | null
  valid_until?: string | null
  amount?: number | null
  currency?: string | null
  quotation_currency?: string | null
  base_reference?: string | null
  deleted_at?: string | null
}

export type PoQuoteLink = {
  quotation_id?: string | null
  quote_reference?: string | null
  quote_valid_until?: string | null
  after_quote_expiry?: boolean | null
  issued_on?: string | null
}

function norm(s: string | null | undefined): string {
  return String(s || '')
    .toLowerCase()
    .replace(/\b(llc|l\.l\.c|fze|fzco|fz-llc|est|co|company|ltd|limited|trading)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** True when two client names are the same company, ignoring LLC / punctuation / case. */
export function sameClientName(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = norm(a)
  return x !== '' && x === norm(b)
}

/** A quote can take a PO once it has been finalized (any status but Draft) and is not archived. */
export function canLinkPoToQuote(q: Pick<LinkableQuote, 'status' | 'deleted_at'>): boolean {
  return q.status !== 'Draft' && !q.deleted_at
}

export function awardsOnLink(status: string): boolean {
  return (AWARDABLE_ON_PO as readonly string[]).includes(status)
}

/**
 * Quotes to offer for a PO: the client's quotes first (newest first), then
 * the rest, Drafts and archived quotes left out.
 */
export function quoteLinkCandidates<T extends LinkableQuote>(quotes: T[], clientName: string, showAll = false): T[] {
  const live = quotes.filter(canLinkPoToQuote)
  const byDate = (a: T, b: T) => String(b.date || '').localeCompare(String(a.date || ''))
  const mine = live.filter((q) => sameClientName(q.client, clientName)).sort(byDate)
  if (!showAll && mine.length) return mine
  const others = live.filter((q) => !sameClientName(q.client, clientName)).sort(byDate)
  return [...mine, ...others]
}

/** Whole days the PO date is after the quote's validity date; 0 when on time or unknown. */
export function daysAfterValidity(issuedOn: string | null | undefined, validUntil: string | null | undefined): number {
  if (!issuedOn || !validUntil) return 0
  const a = Date.parse(`${issuedOn.slice(0, 10)}T00:00:00Z`)
  const b = Date.parse(`${validUntil.slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= b) return 0
  return Math.floor((a - b) / 86_400_000)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function shortDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''))
  if (!m) return ''
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`
}

/** "came 6 days after the quote's validity (20 Nov 2026)", or '' when on time. */
export function lateNote(issuedOn: string | null | undefined, validUntil: string | null | undefined): string {
  const d = daysAfterValidity(issuedOn, validUntil)
  if (!d) return ''
  return `came ${d} day${d === 1 ? '' : 's'} after the quote's validity (${shortDate(validUntil)})`
}

/** One line for lists: "Quote RR-01-26100 · came 6 days after the quote's validity (20 Nov 2026)". */
export function poQuoteSummary(po: PoQuoteLink): string {
  if (!po.quotation_id && !po.quote_reference) return ''
  const ref = po.quote_reference || 'linked'
  const late = lateNote(po.issued_on, po.quote_valid_until)
  return late ? `Quote ${ref} · PO ${late}` : `Quote ${ref}`
}

/** What the PO form tells the user before linking. */
export function linkAdvice(input: {
  quote: Pick<LinkableQuote, 'status' | 'valid_until' | 'client' | 'reference_number'>
  poIssuedOn: string | null | undefined
  poClientName: string
}): string[] {
  const out: string[] = []
  const { quote } = input
  const late = lateNote(input.poIssuedOn, quote.valid_until)
  if (late) {
    out.push(`This PO ${late}. It is still linked; no revision or extension is needed, and the quote's number and totals stay as they are.`)
  }
  if (quote.status === 'Superseded') {
    out.push('This quote was superseded by a revision. It can be linked but will not be marked Awarded; link the live revision if that is what the client ordered.')
  }
  if (input.poClientName && !sameClientName(quote.client, input.poClientName)) {
    out.push(`The quote is for "${quote.client}", not "${input.poClientName}". Check it is the right quote.`)
  }
  return out
}

/** The quote's PO numbers, for the Quotations list ("PO 4200050362, PO 4200050400"). */
export function posByQuote(rows: { quotation_id?: string | null; po_number: string }[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const r of rows) {
    if (!r.quotation_id) continue
    const list = out.get(r.quotation_id) || []
    if (!list.includes(r.po_number)) list.push(r.po_number)
    out.set(r.quotation_id, list)
  }
  return out
}

/** Line added to an invoice's notes when it is made from a quote that has client POs. */
export function invoicePoNote(poNumbers: string[]): string {
  const list = poNumbers.map((p) => p.trim()).filter(Boolean)
  if (!list.length) return ''
  return `Client PO No.: ${list.join(', ')}`
}
