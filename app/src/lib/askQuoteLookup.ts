/**
 * Find existing quotations for Ask RR ("did we raise a quote for X?").
 */

import { db } from './db'
import { displayDocumentReference } from './documents'
import { loadLineItems } from './lineItems'
import { formatAED } from './money'
import type { Quotation } from './types'

export type AskQuoteHit = {
  id: string
  quoteId: string
  client: string
  status: string
  label: string
  amountLabel: string
  date: string
  path: string
}

function norm(s: string): string {
  return s.trim().toLowerCase()
}

export function quotationMatchesClient(q: Pick<Quotation, 'client'>, clientQuery: string): boolean {
  const want = norm(clientQuery)
  const have = norm(q.client || '')
  if (!want || !have) return false
  return have === want || have.includes(want) || want.includes(have)
}

export function toAskQuoteHit(q: Quotation): AskQuoteHit {
  const label = displayDocumentReference({
    referenceNumber: q.reference_number,
    fallbackId: q.quote_id,
    status: q.status,
  })
  return {
    id: q.id,
    quoteId: q.quote_id,
    client: q.client || '',
    status: q.status || '',
    label,
    amountLabel: formatAED(Number(q.amount) || 0),
    date: String(q.date || q.created_at || '').slice(0, 10),
    path: `/document/quote/${q.id}`,
  }
}

/** Compact quotation lines for the Claude CRM fact pack. */
export function quotationFactLines(quotes: Quotation[], limit = 40): string[] {
  return quotes.slice(0, limit).map((q) => {
    const hit = toAskQuoteHit(q)
    return `Quote ${hit.label} · ${hit.client} · ${hit.status} · ${hit.amountLabel} · ${hit.date || 'no date'}`
  })
}

/**
 * Prefer quotes whose client name appears in the question (e.g. "Green Cement"),
 * otherwise fall back to the newest few so price questions still have lines.
 */
export function pickQuotesForQuestion(quotes: Quotation[], question: string, limit = 6): Quotation[] {
  const q = question.trim().toLowerCase()
  if (!q || !quotes.length || limit <= 0) return []
  const matched = quotes.filter((row) => {
    const client = String(row.client || '').trim().toLowerCase()
    if (!client) return false
    if (q.includes(client) || client.includes(q)) return true
    const tokens = client.split(/[^a-z0-9]+/).filter((t) => t.length >= 4)
    return tokens.some((t) => q.includes(t))
  })
  const pool = matched.length ? matched : quotes.slice(0, Math.min(limit, 3))
  return pool.slice(0, limit)
}

/** Per-line unit prices for quotes relevant to the salesperson's question. */
export async function loadQuotationLineFacts(
  quotes: Quotation[],
  question: string,
  opts: { quoteLimit?: number; linesPerQuote?: number } = {},
): Promise<string[]> {
  const quoteLimit = opts.quoteLimit ?? 6
  const linesPerQuote = opts.linesPerQuote ?? 25
  const picked = pickQuotesForQuestion(quotes, question, quoteLimit)
  const out: string[] = []
  for (const quote of picked) {
    const hit = toAskQuoteHit(quote)
    if (!quote.quote_id) continue
    try {
      const items = await loadLineItems('Quote', quote.quote_id)
      if (!items.length) {
        out.push(`Quote ${hit.label} · ${hit.client}: no line items on file`)
        continue
      }
      for (const item of items.slice(0, linesPerQuote)) {
        const desc = String(item.description || item.sku || 'item').replace(/\s+/g, ' ').trim()
        const qty = Number(item.qty) || 0
        const unit = Number(item.unit_price) || 0
        const amount = Number(item.amount) || qty * unit
        out.push(
          `Quote ${hit.label} · ${hit.client} · ${desc} · qty ${qty} · unit ${formatAED(unit)} · amount ${formatAED(amount)}`,
        )
      }
    } catch {
      // Skip quotes we cannot load lines for; totals still remain in quotationFactLines.
    }
  }
  return out
}

export async function loadRecentQuotations(limit = 80): Promise<Quotation[]> {
  const { data, error } = await db
    .from('quotations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data || []) as Quotation[]
}

export async function findQuotationsForClient(clientQuery: string, limit = 12): Promise<AskQuoteHit[]> {
  const q = clientQuery.trim()
  if (!q) return []
  const rows = await loadRecentQuotations(120)
  return rows.filter((row) => quotationMatchesClient(row, q)).slice(0, limit).map(toAskQuoteHit)
}
