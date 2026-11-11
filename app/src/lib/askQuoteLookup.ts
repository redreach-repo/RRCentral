/**
 * Find existing quotations for Ask RR ("did we raise a quote for X?").
 */

import { db } from './db'
import { displayDocumentReference } from './documents'
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
