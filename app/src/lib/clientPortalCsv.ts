/**
 * Client portal CSV import/export helpers.
 * Matches Export CSV on ClientPortalPage (build, tickets, quotes, invoices).
 */
import type { PortalInvoice, PortalQuote, PortalTicket, PortalView } from './clientPortal'

export const PORTAL_BUILD_CSV_HEADERS = ['stage', 'status', 'due'] as const
export const PORTAL_TICKETS_CSV_HEADERS = ['subject', 'status', 'opened', 'note'] as const
export const PORTAL_QUOTES_CSV_HEADERS = ['reference', 'date', 'amount', 'currency', 'state'] as const
export const PORTAL_INVOICES_CSV_HEADERS = ['reference', 'date', 'amount', 'currency', 'balance', 'paid'] as const

export type PortalCsvKind = 'build' | 'tickets' | 'quotes' | 'invoices'

function headerSet(headers: string[]): Set<string> {
  return new Set(headers.map((h) => h.trim().toLowerCase()))
}

function hasAll(set: Set<string>, required: readonly string[]): boolean {
  return required.every((h) => set.has(h))
}

/** Detect which portal export format a CSV is, from its header row. */
export function detectPortalCsvKind(headers: string[]): PortalCsvKind | null {
  const set = headerSet(headers)
  if (hasAll(set, PORTAL_INVOICES_CSV_HEADERS)) return 'invoices'
  if (hasAll(set, PORTAL_QUOTES_CSV_HEADERS)) return 'quotes'
  if (hasAll(set, PORTAL_TICKETS_CSV_HEADERS)) return 'tickets'
  if (hasAll(set, PORTAL_BUILD_CSV_HEADERS)) return 'build'
  return null
}

function parsePaid(raw: string): boolean {
  const v = raw.trim().toLowerCase()
  return v === 'yes' || v === 'true' || v === '1' || v === 'paid' || v === 'y'
}

function parseQuoteState(raw: string): 'waiting' | 'accepted' | null {
  const v = raw.trim().toLowerCase()
  if (!v) return null
  if (v === 'waiting' || v === 'waiting for you' || v === 'pending') return 'waiting'
  if (v === 'accepted' || v.startsWith('accepted')) return 'accepted'
  return null
}

function num(raw: string): number | null {
  const n = Number(String(raw).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : null
}

function rebuildBuildMeta(
  stages: PortalView['build']['stages'],
): Pick<PortalView['build'], 'done' | 'total' | 'percent' | 'current' | 'live'> {
  const total = stages.length
  const done = stages.filter((s) => s.status.trim().toLowerCase() === 'done').length
  const next = stages.find((s) => s.status.trim().toLowerCase() !== 'done')
  return {
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : 0,
    current: next ? next.label : 'Live',
    live: total > 0 && done === total,
  }
}

export type ApplyPortalCsvResult = {
  view: PortalView
  applied: number
  skipped: number
  kind: PortalCsvKind
}

/** Merge CSV rows into a portal view (local overlay; round-trips Export CSV). */
export function applyPortalCsv(
  view: PortalView,
  kind: PortalCsvKind,
  rows: Array<Record<string, string>>,
): ApplyPortalCsvResult {
  let applied = 0
  let skipped = 0

  if (kind === 'build') {
    const stages = view.build.stages.map((s) => ({ ...s }))
    const byLabel = new Map(stages.map((s, i) => [s.label.trim().toLowerCase(), i] as const))
    for (const row of rows) {
      const label = String(row.stage || '').trim()
      const status = String(row.status || '').trim()
      if (!label || !status) {
        skipped += 1
        continue
      }
      const idx = byLabel.get(label.toLowerCase())
      if (idx == null) {
        skipped += 1
        continue
      }
      const dueRaw = String(row.due ?? '').trim()
      stages[idx] = {
        ...stages[idx],
        status,
        due: dueRaw || null,
      }
      applied += 1
    }
    return {
      kind,
      applied,
      skipped,
      view: {
        ...view,
        build: {
          ...view.build,
          stages,
          ...rebuildBuildMeta(stages),
        },
      },
    }
  }

  if (kind === 'tickets') {
    const tickets: PortalTicket[] = view.openTickets.map((t) => ({ ...t }))
    const bySubject = new Map(tickets.map((t, i) => [t.subject.trim().toLowerCase(), i] as const))
    for (const row of rows) {
      const subject = String(row.subject || '').trim()
      if (!subject) {
        skipped += 1
        continue
      }
      const status = String(row.status || '').trim() || 'Open'
      const opened = String(row.opened || '').trim()
      const note = String(row.note || '').trim()
      const key = subject.toLowerCase()
      const idx = bySubject.get(key)
      if (idx != null) {
        tickets[idx] = {
          ...tickets[idx],
          status,
          opened: opened || tickets[idx].opened,
          note: note || tickets[idx].note,
        }
      } else {
        tickets.push({
          id: '',
          subject,
          status,
          opened: opened || '',
          note,
          late: /overdue/i.test(note),
        })
        bySubject.set(key, tickets.length - 1)
      }
      applied += 1
    }
    return { kind, applied, skipped, view: { ...view, openTickets: tickets } }
  }

  if (kind === 'quotes') {
    const quotes: PortalQuote[] = view.quotes.map((q) => ({ ...q }))
    const byRef = new Map(quotes.map((q, i) => [q.reference.trim().toLowerCase(), i] as const))
    for (const row of rows) {
      const reference = String(row.reference || '').trim()
      const amount = num(String(row.amount ?? ''))
      const state = parseQuoteState(String(row.state || ''))
      if (!reference || amount == null || !state) {
        skipped += 1
        continue
      }
      const currency = String(row.currency || '').trim() || 'AED'
      const date = String(row.date || '').trim() || null
      const key = reference.toLowerCase()
      const idx = byRef.get(key)
      if (idx != null) {
        quotes[idx] = {
          ...quotes[idx],
          date: date ?? quotes[idx].date,
          amount,
          currency,
          state,
        }
      } else {
        quotes.push({
          id: `csv-${key}`,
          reference,
          date,
          validUntil: null,
          amount,
          currency,
          state,
          acceptedBy: '',
          acceptedOn: null,
          hasPdf: false,
        })
        byRef.set(key, quotes.length - 1)
      }
      applied += 1
    }
    return { kind, applied, skipped, view: { ...view, quotes } }
  }

  // invoices
  const invoices: PortalInvoice[] = view.invoices.map((inv) => ({ ...inv }))
  const byRef = new Map(invoices.map((inv, i) => [inv.reference.trim().toLowerCase(), i] as const))
  for (const row of rows) {
    const reference = String(row.reference || '').trim()
    const amount = num(String(row.amount ?? ''))
    const balance = num(String(row.balance ?? ''))
    if (!reference || amount == null || balance == null) {
      skipped += 1
      continue
    }
    const currency = String(row.currency || '').trim() || 'AED'
    const date = String(row.date || '').trim() || null
    const paid = parsePaid(String(row.paid || ''))
    const key = reference.toLowerCase()
    const idx = byRef.get(key)
    if (idx != null) {
      invoices[idx] = {
        ...invoices[idx],
        date: date ?? invoices[idx].date,
        amount,
        currency,
        balance,
        paid,
        payUrl: paid ? null : invoices[idx].payUrl,
      }
    } else {
      invoices.push({
        id: `csv-${key}`,
        reference,
        date,
        due: null,
        amount,
        currency,
        balance,
        paid,
        payUrl: null,
      })
      byRef.set(key, invoices.length - 1)
    }
    applied += 1
  }
  return { kind, applied, skipped, view: { ...view, invoices } }
}
