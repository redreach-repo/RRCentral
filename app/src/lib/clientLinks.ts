/**
 * Documents linked to a real client record (HighMast brief fix 3, part 1).
 *
 * Quotes, invoices, delivery notes, payments, deals, tickets and website
 * enquiries carry client_id next to the client name typed on them. The
 * database links one-match rows itself (20261339090000_client_links.sql);
 * anything with two possible clients, or none, is listed here so a manager
 * picks the client. The typed name, numbers, totals and PDFs never change.
 */
import { nameSimilarity, nameKey } from './duplicates'

export type ClientLinkTable =
  | 'quotations'
  | 'invoices'
  | 'delivery_notes'
  | 'customer_payments'
  | 'crm'
  | 'tickets'
  | 'website_inquiries'

export type ClientLinkKind = 'match' | 'ambiguous' | 'unmatched'

/** One row of public.rr_link_clients(). */
export type ClientLinkRow = {
  kind: ClientLinkKind
  table_name: ClientLinkTable
  row_id: string
  row_label: string
  client_text: string
  match: string
  candidates: number
  client_id: string | null
  client_name: string | null
  doc_date: string | null
  batch_id: string | null
}

export type ClientOption = { id: string; company_name: string }

/** Documents typed with the same client name, so one pick links them all. */
export type ClientLinkGroup = {
  key: string
  clientText: string
  kind: ClientLinkKind
  rows: ClientLinkRow[]
}

const TABLE_LABELS: Record<ClientLinkTable, [string, string]> = {
  quotations: ['quote', 'quotes'],
  invoices: ['invoice', 'invoices'],
  delivery_notes: ['delivery note', 'delivery notes'],
  customer_payments: ['payment', 'payments'],
  crm: ['deal', 'deals'],
  tickets: ['ticket', 'tickets'],
  website_inquiries: ['website enquiry', 'website enquiries'],
}

export function tableLabel(table: ClientLinkTable, count = 1): string {
  const pair = TABLE_LABELS[table] ?? [table, table]
  return count === 1 ? pair[0] : pair[1]
}

/** "3 quotes, 1 invoice" */
export function groupSummary(rows: ClientLinkRow[]): string {
  const counts = new Map<ClientLinkTable, number>()
  for (const r of rows) counts.set(r.table_name, (counts.get(r.table_name) ?? 0) + 1)
  return [...counts.entries()].map(([t, n]) => `${n} ${tableLabel(t, n)}`).join(', ')
}

/** Rows a manager still has to decide (two possible clients, or none), grouped by typed name. Ambiguous first, then the biggest groups. */
export function reviewGroups(rows: ClientLinkRow[]): ClientLinkGroup[] {
  const groups = new Map<string, ClientLinkGroup>()
  for (const r of rows) {
    if (r.kind === 'match') continue
    const text = String(r.client_text || '').trim()
    const key = `${r.kind}:${nameKey(text) || text.toLowerCase() || r.row_id}`
    const g = groups.get(key)
    if (g) g.rows.push(r)
    else groups.set(key, { key, clientText: text, kind: r.kind, rows: [r] })
  }
  return [...groups.values()].sort(
    (a, b) =>
      (a.kind === 'ambiguous' ? 0 : 1) - (b.kind === 'ambiguous' ? 0 : 1) ||
      b.rows.length - a.rows.length ||
      a.clientText.localeCompare(b.clientText),
  )
}

/** How many rows the database can link on its own (one match each). */
export function matchCount(rows: ClientLinkRow[]): number {
  return rows.filter((r) => r.kind === 'match').length
}

/** Clients that look like the typed name, best first (at most `limit`). */
export function suggestClients(text: string, clients: ClientOption[], limit = 3, min = 0.45): ClientOption[] {
  const t = String(text || '').trim()
  if (!t) return []
  return clients
    .map((c) => ({ c, s: nameSimilarity(t, c.company_name) }))
    .filter((x) => x.s >= min)
    .sort((a, b) => b.s - a.s || a.c.company_name.localeCompare(b.c.company_name))
    .slice(0, limit)
    .map((x) => x.c)
}

/** Where a review row opens, so the manager can check it before linking. */
export function documentPath(r: Pick<ClientLinkRow, 'table_name' | 'row_id' | 'row_label'>): string {
  const ref = encodeURIComponent(r.row_label)
  switch (r.table_name) {
    case 'quotations':
      return `/quotations?ref=${ref}`
    case 'invoices':
      return `/invoices?ref=${ref}`
    case 'delivery_notes':
      return `/delivery-notes?ref=${ref}`
    case 'customer_payments':
      return '/payments'
    case 'crm':
      return '/crm'
    case 'tickets':
      return `/support/${r.row_id}`
    case 'website_inquiries':
      return '/crm'
  }
}
