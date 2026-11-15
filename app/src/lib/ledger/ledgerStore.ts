import { db } from '../db'
import { isMissingRelationError } from '../errors'
import { isSupabaseConfigured } from '../supabaseConfig'
import { canPostJournal, journalBalance, nextJournalNumber, normalizeLine, type JournalLineInput } from './ledger'

export type GlAccount = {
  id: string
  code: string
  name: string
  account_type: string
  is_postable: boolean
  is_active: boolean
  notes: string
}

export type GlJournal = {
  id: string
  journal_number: string
  entry_date: string
  memo: string
  status: string
  source_type: string
  source_id: string
  posted_at: string | null
}

export type GlJournalLine = {
  id: string
  journal_id: string
  account_id: string
  line_no: number
  memo: string
  debit: number
  credit: number
  gl_accounts?: Pick<GlAccount, 'code' | 'name'> | null
}

export async function listGlAccounts(): Promise<GlAccount[]> {
  if (!isSupabaseConfigured()) return []
  const { data, error } = await db
    .from('gl_accounts')
    .select('id, code, name, account_type, is_postable, is_active, notes')
    .eq('is_active', true)
    .order('code')
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as GlAccount[]
}

export async function listGlJournals(): Promise<GlJournal[]> {
  if (!isSupabaseConfigured()) return []
  const { data, error } = await db
    .from('gl_journals')
    .select('id, journal_number, entry_date, memo, status, source_type, source_id, posted_at')
    .order('entry_date', { ascending: false })
    .limit(100)
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as GlJournal[]
}

export async function listJournalLines(journalId: string): Promise<GlJournalLine[]> {
  if (!isSupabaseConfigured()) return []
  const { data, error } = await db
    .from('gl_journal_lines')
    .select('id, journal_id, account_id, line_no, memo, debit, credit, gl_accounts(code, name)')
    .eq('journal_id', journalId)
    .order('line_no')
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as GlJournalLine[]
}

export async function createDraftJournal(input: {
  entryDate: string
  memo: string
  lines: JournalLineInput[]
  sourceType?: string
  sourceId?: string
}): Promise<GlJournal> {
  const lines = input.lines.map(normalizeLine).filter((l): l is NonNullable<typeof l> => Boolean(l))
  const bal = journalBalance(lines)
  if (!bal.balanced) throw new Error('Journal must be balanced before save')

  const existing = await listGlJournals()
  const journal_number = nextJournalNumber(
    existing.map((j) => j.journal_number),
    input.entryDate,
  )

  const { data: header, error: hErr } = await db
    .from('gl_journals')
    .insert({
      journal_number,
      entry_date: input.entryDate,
      memo: input.memo.trim(),
      status: 'draft',
      source_type: input.sourceType || 'manual',
      source_id: input.sourceId || '',
    })
    .select('id, journal_number, entry_date, memo, status, source_type, source_id, posted_at')
    .single()
  if (hErr) throw hErr

  const rows = lines.map((l, i) => ({
    journal_id: header.id,
    account_id: l.accountId,
    line_no: i + 1,
    memo: l.memo || '',
    debit: l.debit,
    credit: l.credit,
  }))
  const { error: lErr } = await db.from('gl_journal_lines').insert(rows)
  if (lErr) throw lErr
  return header as GlJournal
}

/** M13: create draft journal from invoice totals using starter CoA codes (Unverified). */
export async function createInvoiceAutoPostDraft(input: {
  invoiceId: string
  invoiceNumber: string
  entryDate: string
  exclusiveAed: number
  vatAed: number
  inclusiveAed: number
}): Promise<GlJournal | null> {
  const { autoPostMemo, autoPostSourceId, invoiceToDraftLines, linesBalance } = await import('./autoPost')
  const draftLines = invoiceToDraftLines(input)
  if (!draftLines.length || !linesBalance(draftLines)) return null

  const accounts = await listGlAccounts()
  const map = new Map(accounts.map((a) => [a.code, a.id]))
  const resolved = draftLines.map((l) => {
    const accountId = map.get(l.code)
    if (!accountId) return null
    return { accountId, memo: l.memo, debit: l.debit, credit: l.credit }
  })
  if (resolved.some((r) => !r)) return null
  try {
    return await createDraftJournal({
      entryDate: input.entryDate,
      memo: autoPostMemo(input),
      lines: resolved as JournalLineInput[],
      sourceType: 'invoice',
      sourceId: autoPostSourceId(input.invoiceId),
    })
  } catch (e) {
    // Unique source key → already drafted
    if (String((e as { code?: string })?.code || '').includes('23505')) return null
    throw e
  }
}

export async function postJournal(journalId: string, lines: JournalLineInput[]): Promise<GlJournal> {
  const gate = canPostJournal({ status: 'draft', lines })
  if (!gate.ok) throw new Error(gate.reason)
  const { data, error } = await db.rpc('rr_gl_post_journal', { p_journal: journalId })
  if (error) throw error
  return data as GlJournal
}
