import { db, isSupabaseConfigured } from './db'
import { errorCode, isMissingRelationError, rawErrorMessage } from './errors'
import type { CrmEntry, Quotation } from './types'
import {
  accountCandidates,
  dealCandidates,
  linkedDeal,
  quoteBaseReference,
  sortQuoteNotes,
  type LinkAccount,
  type LinkDeal,
  type QuoteNote,
} from './quoteRevisions'

/**
 * Revise / extend / notes for quotes. The work happens in the database
 * (rr_quote_revise, rr_quote_extend_validity, rr_quote_finalize_revision,
 * quote_notes), so the screens and the AI connector follow the same rules.
 * SQL: supabase/migrations/20261329090000_quote_revisions.sql.
 */

export const QUOTE_REVISIONS_SQL = 'quote-revisions.sql'

/** The quote revision functions or the notes table are not on the database yet. */
export function isQuoteRevisionSetupMissing(err: unknown): boolean {
  const code = errorCode(err)
  const msg = rawErrorMessage(err, '').toLowerCase()
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    isMissingRelationError(err) ||
    /could not find the function/.test(msg) ||
    (/quote_notes/.test(msg) && /does not exist/.test(msg))
  )
}

export function setupMissingMessage(): string {
  return `Revise and extend need a database update first: run ${QUOTE_REVISIONS_SQL} in Supabase (Admin, System check lists it).`
}

function friendly(err: unknown): Error {
  if (isQuoteRevisionSetupMissing(err)) return new Error(setupMissingMessage())
  return new Error(rawErrorMessage(err, 'The database refused the change.'))
}

export type RevisionResult = {
  quote: Quotation & { revised_from?: string | null }
  revised_from: { id: string; reference: string; status: string; valid_until: string | null }
  extended: boolean
  superseded: { id: string; reference: string }[]
  lines_copied?: number
}

/** New Draft revision (RR-01-26008-R1) of a Finalized, Sent or Expired quote. */
export async function reviseQuote(quoteId: string, validUntil: string, reason: string): Promise<RevisionResult> {
  const { data, error } = await db.rpc('rr_quote_revise', {
    p_id: quoteId,
    p_valid_until: validUntil || null,
    p_reason: reason || '',
    p_extend: false,
  })
  if (error) throw friendly(error)
  return data as RevisionResult
}

/** Same quote with a later valid-until date, in one step: revision made and finalized, the old one Superseded. */
export async function extendQuoteValidity(quoteId: string, validUntil: string, reason: string): Promise<RevisionResult> {
  const { data, error } = await db.rpc('rr_quote_extend_validity', {
    p_id: quoteId,
    p_valid_until: validUntil,
    p_reason: reason,
  })
  if (error) throw friendly(error)
  return data as RevisionResult
}

/** Finalize a draft revision: it keeps its -R number and the older live quote becomes Superseded. */
export async function finalizeRevision(quoteId: string): Promise<{ quote: Quotation; superseded: { id: string; reference: string }[] }> {
  const { data, error } = await db.rpc('rr_quote_finalize_revision', { p_id: quoteId, p_status: 'Finalized' })
  if (error) throw friendly(error)
  return data as { quote: Quotation; superseded: { id: string; reference: string }[] }
}

type ChainQuote = Pick<Quotation, 'id' | 'reference_number' | 'base_reference' | 'status' | 'revision' | 'client' | 'valid_until'> & {
  revised_from?: string | null
  account_id?: string | null
  contact_email?: string | null
}

const CHAIN_COLUMNS = 'id, reference_number, base_reference, status, revision, client, valid_until, account_id, contact_email'

/** Quotes whose base number or own number is one of `refs` (two plain queries; works in local mode too). */
async function quotesByRefs(refs: string[]): Promise<ChainQuote[]> {
  const list = [...new Set(refs.map((r) => r.trim()).filter(Boolean))]
  if (!list.length) return []
  const [byBase, byRef] = await Promise.all([
    db.from('quotations').select(CHAIN_COLUMNS).in('base_reference', list),
    db.from('quotations').select(CHAIN_COLUMNS).in('reference_number', list),
  ])
  if (byBase.error) throw byBase.error
  if (byRef.error) throw byRef.error
  const seen = new Map<string, ChainQuote>()
  for (const r of [...(byBase.data || []), ...(byRef.data || [])] as ChainQuote[]) seen.set(r.id, r)
  return [...seen.values()]
}

/** Every quote that shares this quote's base number (the chain), oldest first. */
export async function loadQuoteChain(q: ChainQuote): Promise<ChainQuote[]> {
  const base = quoteBaseReference(q)
  if (!base) return [q]
  const rows = (await quotesByRefs([base])).filter((r) => r.id !== q.id && quoteBaseReference(r) === base)
  return [...rows, q].sort((a, b) => (Number(a.revision) || 0) - (Number(b.revision) || 0))
}

/** Notes of the whole chain, newest first. `missing` until the SQL is run. */
export async function listQuoteNotes(quoteIds: string[]): Promise<{ notes: QuoteNote[]; missing: boolean }> {
  if (!quoteIds.length) return { notes: [], missing: false }
  if (!isSupabaseConfigured()) return { notes: [], missing: true }
  const { data, error } = await db.from('quote_notes').select('*').in('quotation_id', quoteIds)
  if (error) {
    if (isQuoteRevisionSetupMissing(error)) return { notes: [], missing: true }
    throw error
  }
  return { notes: sortQuoteNotes((data || []) as QuoteNote[]), missing: false }
}

/** Notes for a deal: every quote whose number (or base number) is the deal's quote ref. */
export async function listNotesForQuoteRef(quoteRef: string): Promise<{ notes: QuoteNote[]; missing: boolean; refs: string[] }> {
  const ref = String(quoteRef || '').trim()
  if (!ref) return { notes: [], missing: false, refs: [] }
  const direct = await quotesByRefs([ref])
  const base = direct.length ? quoteBaseReference(direct[0]) : quoteBaseReference({ base_reference: '', reference_number: ref })
  const rows = (await quotesByRefs([base, ref])).filter((r) => quoteBaseReference(r) === base || r.reference_number === ref)
  const res = await listQuoteNotes(rows.map((r) => r.id))
  return { ...res, refs: rows.map((r) => r.reference_number).filter(Boolean) }
}

export async function addQuoteNote(quoteId: string, body: string): Promise<void> {
  const { error } = await db.from('quote_notes').insert({ quotation_id: quoteId, body: body.trim(), kind: 'note' })
  if (error) throw friendly(error)
}

// ---- Linking a quote to a deal or an account -----------------------------------

export type QuoteLinks = {
  deal: (LinkDeal & Partial<CrmEntry>) | null
  account: LinkAccount | null
  dealMatches: (LinkDeal & Partial<CrmEntry>)[]
  accountMatches: LinkAccount[]
}

export async function loadQuoteLinks(q: ChainQuote, chainRefs: string[]): Promise<QuoteLinks> {
  const [crm, accounts, contacts] = await Promise.all([
    db.from('crm').select('id, company_name, quote_ref, pipeline_stage, email_phone, account_id, contacts').limit(5000),
    db.from('accounts').select('id, name, reference').limit(5000),
    db.from('account_contacts').select('account_id, email').limit(10000),
  ])
  const deals = (crm.error ? [] : crm.data || []) as (LinkDeal & Partial<CrmEntry>)[]
  const emailsByAccount = new Map<string, string[]>()
  for (const c of (contacts.error ? [] : contacts.data || []) as { account_id: string; email: string }[]) {
    if (!c.email) continue
    emailsByAccount.set(c.account_id, [...(emailsByAccount.get(c.account_id) || []), c.email])
  }
  const accs = ((accounts.error ? [] : accounts.data || []) as LinkAccount[]).map((a) => ({ ...a, emails: emailsByAccount.get(a.id) || [] }))
  const deal = linkedDeal(deals, chainRefs)
  const account = q.account_id ? accs.find((a) => a.id === q.account_id) || null : null
  return {
    deal,
    account,
    dealMatches: deal ? [] : dealCandidates(deals, q),
    accountMatches: account ? [] : accountCandidates(accs, q),
  }
}

/** Point an existing deal at this quote (its live number). */
export async function linkDealToQuote(dealId: string, quoteRef: string, who: string): Promise<void> {
  const { error } = await db
    .from('crm')
    .update({ quote_ref: quoteRef, updated_by: who, updated_at: new Date().toISOString() })
    .eq('id', dealId)
  if (error) throw friendly(error)
}

/** Create a company-pipeline deal for this quote (stage Quoted, follow up before the quote expires). */
export async function createDealForQuote(
  q: ChainQuote & { contact_name?: string | null; contact_phone?: string | null },
  quoteRef: string,
  who: string,
  followUp: string,
): Promise<string> {
  const id = crypto.randomUUID()
  const { error } = await db.from('crm').insert({
    id,
    company_name: q.client,
    primary_contact: q.contact_name || '',
    email_phone: q.contact_email || '',
    pipeline_stage: 'Quoted',
    quote_ref: quoteRef,
    next_action: `Follow up on quote ${quoteRef}`,
    follow_up_date: followUp,
    account_id: q.account_id || null,
    notes: '',
    created_by: who,
    updated_by: who,
    calendar_event_id: '',
  })
  if (error) throw friendly(error)
  return id
}

/** Link the quote (every quote in its chain) to an account. Numbers and totals are not touched. */
export async function linkAccountToQuotes(quoteIds: string[], accountId: string, who: string): Promise<void> {
  const { error } = await db
    .from('quotations')
    .update({ account_id: accountId, updated_by: who, updated_at: new Date().toISOString() })
    .in('id', quoteIds)
  if (error) throw friendly(error)
}
