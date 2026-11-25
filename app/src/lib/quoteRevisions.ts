import type { Quotation } from './types'

/**
 * Revise and extend sent quotes (HighMast fix 2). Pure rules shared by the
 * Quotations page, the deal notes and the AI connector (highmast-mcp).
 * The database enforces the same rules: 20261329090000_quote_revisions.sql.
 */

/** Statuses a quote can be revised or extended from. */
export const REVISABLE_STATUSES = ['Finalized', 'Sent', 'Expired'] as const

export type QuoteNoteKind = 'note' | 'revised' | 'extended' | 'superseded' | 'finalized'

export type QuoteNote = {
  id: string
  quotation_id: string
  quote_ref: string
  base_reference: string
  kind: QuoteNoteKind
  body: string
  created_by_email: string
  source: 'app' | 'ai'
  created_at: string
}

type RevQuote = Pick<Quotation, 'id' | 'status' | 'reference_number' | 'base_reference' | 'revision' | 'valid_until'> & {
  revised_from?: string | null
  deleted_at?: string | null
}

export const QUOTE_NOTE_MAX = 4000
export const REVISION_REASON_MAX = 1000
/** Default extension: old valid-until + 14 days (never less than 14 days from today). */
export const DEFAULT_EXTENSION_DAYS = 14

const DAY_MS = 86_400_000

/** yyyy-MM-dd for a date (UTC, as the database stores dates). */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDaysIso(iso: string, days: number): string {
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)
  return isoDay(new Date(t + days * DAY_MS))
}

/** The base number of a quote: base_reference, or its number without a revision suffix. */
export function quoteBaseReference(q: Pick<Quotation, 'base_reference' | 'reference_number'>): string {
  const base = String(q.base_reference || '').trim()
  if (base) return base
  return String(q.reference_number || '')
    .trim()
    .replace(/(_revision\s+\d+|-R\d+)$/i, '')
}

/** Number shown for a revision: RR-01-26008-R1. Revision 0 is the base number. */
export function revisionReference(base: string, revision: number): string {
  const n = Math.max(0, Math.floor(Number(revision) || 0))
  return n ? `${base}-R${n}` : base
}

/**
 * Default valid-until for a revision or extension: the old date + 14 days.
 * If that is already past (a long-expired quote), 14 days from today.
 * RR-01-26008 valid until 2026-11-25 → 2026-12-09.
 */
export function defaultRevisionValidUntil(validUntil: string | null | undefined, today: string): string {
  const fromOld = addDaysIso(validUntil ? validUntil.slice(0, 10) : today, DEFAULT_EXTENSION_DAYS)
  const fromToday = addDaysIso(today, DEFAULT_EXTENSION_DAYS)
  return fromOld > fromToday ? fromOld : fromToday
}

export function isRevision(q: { revised_from?: string | null }): boolean {
  return Boolean(q.revised_from)
}

/** A Draft revision: finalizing it keeps its -R number and supersedes the older quote. */
export function isDraftRevision(q: Pick<Quotation, 'status'> & { revised_from?: string | null }): boolean {
  return q.status === 'Draft' && isRevision(q)
}

/** The quotes that share a base reference (the original and all its revisions), oldest first. */
export function quoteChain<T extends RevQuote>(all: T[], q: RevQuote): T[] {
  const base = quoteBaseReference(q)
  if (!base) return all.filter((o) => o.id === q.id)
  return all
    .filter((o) => !o.deleted_at && (o.id === q.id || quoteBaseReference(o) === base))
    .sort((a, b) => (Number(a.revision) || 0) - (Number(b.revision) || 0))
}

/** Why this quote cannot be revised (null = it can). `all` is every quote loaded on the page. */
export function reviseProblem(q: RevQuote, all: RevQuote[] = []): string | null {
  if (q.deleted_at) return 'This quote is archived. Restore it first.'
  if (!(REVISABLE_STATUSES as readonly string[]).includes(q.status)) {
    if (q.status === 'Superseded') return 'This quote has been replaced by a newer revision.'
    if (q.status === 'Draft') return 'Drafts can be edited directly.'
    return `A ${q.status} quote cannot be revised.`
  }
  if (!quoteBaseReference(q)) return 'Finalize the quote before revising it.'
  const chain = quoteChain(all, q)
  const openDraft = chain.find((o) => o.id !== q.id && o.status === 'Draft' && isRevision(o))
  if (openDraft) return `Revision ${openDraft.reference_number} is already open as a draft. Finish or archive it first.`
  const newer = chain.find(
    (o) =>
      o.id !== q.id &&
      !['Draft', 'Superseded', 'Not awarded'].includes(o.status) &&
      (Number(o.revision) || 0) > (Number(q.revision) || 0),
  )
  if (newer) return `There is a newer revision, ${newer.reference_number}. Revise that one.`
  return null
}

/** The next revision number for a quote, given the quotes on the page. */
export function nextRevisionNumber(q: RevQuote, all: RevQuote[] = []): number {
  const chain = quoteChain(all, q)
  return Math.max(Number(q.revision) || 0, ...chain.map((o) => Number(o.revision) || 0)) + 1
}

export type RevisionInput = { validUntil: string; reason: string; extend: boolean }

/** Checks the Revise / Extend validity form (the database checks the same). */
export function revisionInputProblem(
  input: RevisionInput,
  current: { valid_until?: string | null },
  today: string,
): string | null {
  const until = String(input.validUntil || '').slice(0, 10)
  const reason = String(input.reason || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) return 'Pick the new valid-until date.'
  if (until < today) return 'The new valid-until date is in the past.'
  if (reason.length > REVISION_REASON_MAX) return 'Keep the reason under 1,000 characters.'
  if (input.extend) {
    if (!reason) return 'Say why the validity is extended (for example the meeting it was agreed in).'
    const old = current.valid_until ? current.valid_until.slice(0, 10) : ''
    if (old && until <= old) return `Pick a date after the current valid-until date (${old}).`
  }
  return null
}

export function quoteNoteProblem(body: string): string | null {
  const t = String(body || '').trim()
  if (!t) return 'Write the note first.'
  if (t.length > QUOTE_NOTE_MAX) return 'Keep a note under 4,000 characters.'
  return null
}

/** Newest first. */
export function sortQuoteNotes<T extends Pick<QuoteNote, 'created_at'>>(notes: T[]): T[] {
  return [...notes].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
}

const KIND_LABELS: Record<QuoteNoteKind, string> = {
  note: 'Note',
  revised: 'Revised',
  extended: 'Validity extended',
  superseded: 'Superseded',
  finalized: 'Revision finalized',
}

export function quoteNoteKindLabel(kind: string): string {
  return KIND_LABELS[kind as QuoteNoteKind] || 'Note'
}

/**
 * Short line for the quotes list: "Revision 1 of RR-01-26008" or
 * "Replaced by RR-01-26008-R1".
 */
export function revisionMeta(q: RevQuote, all: RevQuote[] = []): string {
  const base = quoteBaseReference(q)
  if (q.status === 'Superseded') {
    const live = quoteChain(all, q).find((o) => o.id !== q.id && !['Superseded', 'Draft'].includes(o.status))
    return live ? `Replaced by ${live.reference_number}` : 'Replaced by a newer revision'
  }
  if ((Number(q.revision) || 0) > 0 && base) return `Revision ${q.revision} of ${base}`
  return ''
}

// ---- Linking a quote to a deal or account -------------------------------------

export type LinkDeal = { id: string; company_name: string; quote_ref?: string | null; pipeline_stage?: string | null; email_phone?: string | null; account_id?: string | null; contacts?: { email?: string }[] | null }
export type LinkAccount = { id: string; name: string; reference?: string | null; emails?: string[] }

function normName(s: string | null | undefined): string {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(l\.?l\.?c|llc|fze|fzco|fz-llc|co|company|est|establishment|trading|sp|the)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Same company by name: equal once legal suffixes are dropped, or one name contains the other. */
export function sameCompanyName(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normName(a)
  const y = normName(b)
  if (!x || !y) return false
  if (x === y) return true
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  return short.length >= 4 && (` ${long} `).includes(` ${short} `)
}

function emailsOf(d: LinkDeal): string[] {
  const out = new Set<string>()
  const fromText = String(d.email_phone || '').match(/[^\s,;<>]+@[^\s,;<>]+/g) || []
  for (const e of fromText) out.add(e.toLowerCase())
  for (const c of d.contacts || []) if (c?.email) out.add(String(c.email).trim().toLowerCase())
  return [...out]
}

/** The deal that already carries one of this chain's numbers (the linked deal), if any. */
export function linkedDeal<T extends LinkDeal>(deals: T[], chainRefs: string[]): T | null {
  const refs = new Set(chainRefs.map((r) => r.trim().toLowerCase()).filter(Boolean))
  return deals.find((d) => refs.has(String(d.quote_ref || '').trim().toLowerCase())) || null
}

/** Deals that look like this quote's client (by name, or by the quote contact's email), best first. */
export function dealCandidates<T extends LinkDeal>(
  deals: T[],
  quote: Pick<Quotation, 'client'> & { contact_email?: string | null; account_id?: string | null },
): T[] {
  const email = String(quote.contact_email || '').trim().toLowerCase()
  const scored = deals
    .map((d) => {
      let score = 0
      if (quote.account_id && d.account_id === quote.account_id) score += 4
      if (normName(d.company_name) === normName(quote.client)) score += 3
      else if (sameCompanyName(d.company_name, quote.client)) score += 2
      if (email && emailsOf(d).includes(email)) score += 2
      return { d, score }
    })
    .filter((x) => x.score > 0)
  scored.sort((a, b) => b.score - a.score || a.d.company_name.localeCompare(b.d.company_name))
  return scored.slice(0, 5).map((x) => x.d)
}

/** Accounts that look like this quote's client, best first. */
export function accountCandidates<T extends LinkAccount>(accounts: T[], quote: Pick<Quotation, 'client'> & { contact_email?: string | null }): T[] {
  const email = String(quote.contact_email || '').trim().toLowerCase()
  return accounts
    .map((a) => ({
      a,
      score:
        (normName(a.name) === normName(quote.client) ? 3 : sameCompanyName(a.name, quote.client) ? 2 : 0) +
        (email && (a.emails || []).some((e) => String(e).trim().toLowerCase() === email) ? 2 : 0),
    }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score || x.a.name.localeCompare(y.a.name))
    .slice(0, 5)
    .map((x) => x.a)
}
