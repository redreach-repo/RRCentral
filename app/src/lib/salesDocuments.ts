/**
 * Home, "Made by Sales": every quote, invoice, delivery note and client PO
 * that Sales users made, newest first, with who made it. For admins and
 * managers (the database already lets them read every document).
 *
 * created_by is stamped by the database with the maker's email
 * (20261337090000_document_created_by.sql). Pure functions only.
 */

export type SalesDocKind = 'quote' | 'invoice' | 'delivery_note' | 'client_po'

export const SALES_DOC_KINDS: readonly { kind: SalesDocKind; label: string; plural: string }[] = [
  { kind: 'quote', label: 'Quote', plural: 'Quotes' },
  { kind: 'invoice', label: 'Invoice', plural: 'Invoices' },
  { kind: 'delivery_note', label: 'Delivery note', plural: 'Delivery notes' },
  { kind: 'client_po', label: 'Client PO', plural: 'Client POs' },
]

export type SalesDoc = {
  kind: SalesDocKind
  id: string
  reference: string
  client: string
  /** Null for delivery notes (quantities only). */
  amount: number | null
  currency: string
  status: string
  created_at: string
  /** Maker's email, lower case. */
  created_by: string
}

export type TeamMember = { email: string; name: string; role: string; active?: boolean }

/** Person filter: all Sales users, everyone, or one email. */
export const ALL_SALES = '__sales__'
export const EVERYONE = '__all__'

export const PERIOD_DAYS: readonly number[] = [7, 30, 90]

export function normEmail(v: unknown): string {
  return String(v ?? '').trim().toLowerCase()
}

/** Emails of Sales users (active or not: a leaver's documents still count). */
export function salesEmails(team: readonly TeamMember[]): Set<string> {
  return new Set(team.filter((m) => m.role === 'sales').map((m) => normEmail(m.email)).filter(Boolean))
}

/** Display name for a maker: the team member's name, else the email, else "Unknown". */
export function makerName(email: string, team: readonly TeamMember[]): string {
  const e = normEmail(email)
  if (!e) return 'Unknown'
  const m = team.find((t) => normEmail(t.email) === e)
  return (m?.name || '').trim() || e
}

/** ISO time `days` before `now`. */
export function sinceIso(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

export type SalesDocFilter = {
  person: string
  kind: SalesDocKind | 'all'
  sinceIso: string
}

export function filterSalesDocs(docs: readonly SalesDoc[], team: readonly TeamMember[], f: SalesDocFilter): SalesDoc[] {
  const sales = salesEmails(team)
  const person = f.person === ALL_SALES || f.person === EVERYONE ? f.person : normEmail(f.person)
  return docs
    .filter((d) => {
      const maker = normEmail(d.created_by)
      if (person === ALL_SALES) {
        if (!sales.has(maker)) return false
      } else if (person !== EVERYONE && maker !== person) return false
      if (f.kind !== 'all' && d.kind !== f.kind) return false
      return d.created_at >= f.sinceIso
    })
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
}

export type MakerSummary = {
  email: string
  name: string
  counts: Record<SalesDocKind, number>
  total: number
}

/** One row per maker with how many of each document they made, most first. */
export function summarizeByMaker(docs: readonly SalesDoc[], team: readonly TeamMember[]): MakerSummary[] {
  const by = new Map<string, MakerSummary>()
  for (const d of docs) {
    const email = normEmail(d.created_by)
    let row = by.get(email)
    if (!row) {
      row = {
        email,
        name: makerName(email, team),
        counts: { quote: 0, invoice: 0, delivery_note: 0, client_po: 0 },
        total: 0,
      }
      by.set(email, row)
    }
    row.counts[d.kind] += 1
    row.total += 1
  }
  return [...by.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
}

/** Where a document opens. */
export function salesDocHref(d: Pick<SalesDoc, 'kind' | 'reference'>): string {
  const ref = encodeURIComponent(d.reference)
  switch (d.kind) {
    case 'quote':
      return `/quotations?ref=${ref}`
    case 'invoice':
      return `/invoices?ref=${ref}`
    case 'delivery_note':
      return `/delivery-notes?find=${ref}`
    case 'client_po':
      return `/client-pos?ref=${ref}`
  }
}

export function kindLabel(kind: SalesDocKind): string {
  return SALES_DOC_KINDS.find((k) => k.kind === kind)?.label ?? kind
}

type Row = Record<string, unknown>

const num = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Database rows to documents. Archived (deleted_at) rows are left out. */
export function toSalesDocs(
  rows: { quotes?: Row[]; invoices?: Row[]; deliveryNotes?: Row[]; clientPos?: Row[] },
  accountNames: ReadonlyMap<string, string> = new Map(),
  clientNames: ReadonlyMap<string, string> = new Map(),
): SalesDoc[] {
  const live = (r: Row) => !r.deleted_at
  const base = (r: Row) => ({
    id: String(r.id ?? ''),
    status: String(r.status ?? ''),
    created_at: String(r.created_at ?? ''),
    created_by: normEmail(r.created_by),
  })
  const out: SalesDoc[] = []
  for (const r of (rows.quotes ?? []).filter(live)) {
    out.push({
      ...base(r),
      kind: 'quote',
      reference: String(r.reference_number || r.quote_id || ''),
      client: String(r.client ?? ''),
      amount: num(r.amount),
      currency: String(r.quotation_currency || r.currency || 'AED'),
    })
  }
  for (const r of (rows.invoices ?? []).filter(live)) {
    out.push({
      ...base(r),
      kind: 'invoice',
      reference: String(r.reference_number ?? ''),
      client: String(r.client ?? ''),
      amount: num(r.amount),
      currency: String(r.currency || 'AED'),
    })
  }
  for (const r of (rows.deliveryNotes ?? []).filter(live)) {
    out.push({
      ...base(r),
      kind: 'delivery_note',
      reference: String(r.reference_number ?? ''),
      client: String(r.client ?? ''),
      amount: null,
      currency: '',
    })
  }
  for (const r of (rows.clientPos ?? []).filter(live)) {
    const client =
      (r.client_id ? clientNames.get(String(r.client_id)) : undefined) ||
      (r.account_id ? accountNames.get(String(r.account_id)) : undefined) ||
      ''
    out.push({
      ...base(r),
      kind: 'client_po',
      reference: String(r.po_number ?? ''),
      client,
      amount: num(r.amount),
      currency: String(r.currency || 'AED'),
    })
  }
  return out
}
