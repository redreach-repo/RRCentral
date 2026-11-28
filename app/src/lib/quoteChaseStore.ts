import { db, isSupabaseConfigured } from './db'
import { isMissingRelationError, isUndefinedColumnError } from './errors'
import {
  buildQuoteChaseRows,
  isoDate,
  planQuoteChaseTasks,
  quoteChaseSettingsFrom,
  quoteTasksToClose,
  type ChaseChannel,
  type ChaseQuote,
  type ChaseQuotePo,
  type QuoteChaseEntry,
  type QuoteChaseRow,
  type QuoteChaseSettings,
  type QuoteChaseSettingsRow,
  type QuoteChaseTask,
  type QuoteResponse,
} from './quoteChase'

/**
 * Quote follow-up chasing: loads and saves for the Quote follow-up page, the
 * follow-up log on a quote and the dashboard card. Rules live in
 * quoteChase.ts. Tables: supabase/migrations/20261334090000_quote_chase.sql.
 * Until that SQL is run, the list still shows (from the quotes alone) and
 * `setupMissing` is true.
 */

export type QuoteChaseData = {
  rows: QuoteChaseRow[]
  tasks: QuoteChaseTask[]
  log: QuoteChaseEntry[]
  settings: QuoteChaseSettings
  /** The follow-up tables are not in the database yet. */
  setupMissing: boolean
  ownerByAccount: Map<string, string>
  userByEmail: Map<string, string>
}

const CHASE_TABLES = new Set(['quote_chase_settings', 'quote_chase_log', 'quote_chase_tasks'])

async function tableRows<T>(
  build: () => PromiseLike<{ data: unknown; error: unknown }>,
  table = '',
): Promise<{ rows: T[]; missing: boolean }> {
  // Local mode (no Supabase) has no follow-up tables: they read as not set up.
  if (CHASE_TABLES.has(table) && !isSupabaseConfigured()) return { rows: [], missing: true }
  try {
    const { data, error } = await build()
    if (error) {
      if (isMissingRelationError(error) || isUndefinedColumnError(error)) return { rows: [], missing: true }
      throw error
    }
    return { rows: (data || []) as T[], missing: false }
  } catch (e) {
    if (isMissingRelationError(e) || isUndefinedColumnError(e)) return { rows: [], missing: true }
    throw e
  }
}

export async function loadQuoteChaseSettings(): Promise<{ settings: QuoteChaseSettings; missing: boolean }> {
  const res = await tableRows<QuoteChaseSettingsRow>(() => db.from('quote_chase_settings').select('*').limit(1), 'quote_chase_settings')
  return { settings: quoteChaseSettingsFrom(res.rows[0]), missing: res.missing }
}

type PoRow = ChaseQuotePo & { status?: string | null; issued_on?: string | null }

export async function loadQuoteChaseData(today: Date = new Date()): Promise<QuoteChaseData> {
  const [quotes, log, tasks, settings, pos, accounts, users] = await Promise.all([
    tableRows<ChaseQuote>(() => db.from('quotations').select('*').in('status', ['Sent', 'Accepted', 'Expired'])),
    tableRows<QuoteChaseEntry>(() => db.from('quote_chase_log').select('*'), 'quote_chase_log'),
    tableRows<QuoteChaseTask>(() => db.from('quote_chase_tasks').select('*'), 'quote_chase_tasks'),
    loadQuoteChaseSettings(),
    tableRows<PoRow>(() => db.from('client_purchase_orders').select('*')),
    tableRows<{ id: string; owner_user_id: string | null }>(() => db.from('accounts').select('id, owner_user_id')),
    tableRows<{ id: string; email: string | null }>(() => db.from('app_users').select('id, email')),
  ])
  const liveLog = log.rows.filter((e) => !e.deleted_at)
  const ownerByAccount = new Map(accounts.rows.filter((a) => a.owner_user_id).map((a) => [a.id, a.owner_user_id as string]))
  const userByEmail = new Map(users.rows.filter((u) => u.email).map((u) => [String(u.email).toLowerCase(), u.id]))
  const rows = buildQuoteChaseRows({
    quotes: quotes.rows,
    log: liveLog,
    tasks: tasks.rows,
    pos: pos.rows
      .filter((p) => p.status !== 'canceled')
      .map((p) => ({ quotation_id: p.quotation_id, quote_reference: p.quote_reference, po_number: p.po_number, po_date: p.po_date || p.issued_on || null })),
    settings: settings.settings,
    today,
  })
  return {
    rows,
    tasks: tasks.rows,
    log: liveLog,
    settings: settings.settings,
    setupMissing: log.missing || tasks.missing || settings.missing,
    ownerByAccount,
    userByEmail,
  }
}

/**
 * Adds the task for the step each Sent quote has reached, and closes open
 * tasks on quotes that no longer wait for an answer. Safe to call on every
 * page load: one task per quote, kind and step (the database refuses a
 * second). Returns how many tasks were added. Sales and up (the database
 * checks too, and a locked Sales user only reaches their own quotes).
 */
export async function syncQuoteChaseTasks(data: QuoteChaseData, today: Date = new Date()): Promise<number> {
  if (data.setupMissing) return 0
  const plan = planQuoteChaseTasks({
    rows: data.rows,
    tasks: data.tasks,
    settings: data.settings,
    today,
    ownerByAccount: data.ownerByAccount,
    userByEmail: data.userByEmail,
  })
  const close = quoteTasksToClose(data.tasks, data.rows)
  if (plan.length) {
    const { error } = await db.from('quote_chase_tasks').upsert(plan, { onConflict: 'quotation_id,kind,step_day', ignoreDuplicates: true })
    if (error) throw error
  }
  if (close.length) {
    const { error } = await db
      .from('quote_chase_tasks')
      .update({ status: 'closed', outcome: 'The quote no longer waits for an answer (awarded, closed, expired or accepted).' })
      .in('id', close)
    if (error) throw error
  }
  return plan.length
}

export async function listQuoteChaseLog(quotationId: string): Promise<{ log: QuoteChaseEntry[]; missing: boolean }> {
  const res = await tableRows<QuoteChaseEntry>(() => db.from('quote_chase_log').select('*').eq('quotation_id', quotationId), 'quote_chase_log')
  return { log: res.rows.filter((e) => !e.deleted_at), missing: res.missing }
}

export type QuoteChaseNoteInput = {
  quotation_id: string
  chased_on: string
  channel: ChaseChannel
  contact: string
  note: string
  response: QuoteResponse | ''
  next_follow_up: string | null
}

/** Problem with a follow-up before it is saved, or null. */
export function quoteChaseNoteProblem(input: QuoteChaseNoteInput, today: Date = new Date()): string | null {
  if (!input.chased_on || !/^\d{4}-\d{2}-\d{2}$/.test(input.chased_on)) return 'Pick the date of the follow-up.'
  if (input.chased_on > isoDate(new Date(today.getTime() + 86_400_000))) return 'The follow-up date cannot be in the future.'
  if (input.next_follow_up && input.next_follow_up < input.chased_on) return 'The call-back date cannot be before the follow-up.'
  if (!input.note.trim() && !input.next_follow_up && !input.response) return 'Add a note, the client’s answer or a call-back date.'
  if (input.note.length > 4000) return 'The note is too long (4,000 characters at most).'
  if (input.contact.length > 200) return 'The contact is too long.'
  return null
}

export async function addQuoteChaseNote(input: QuoteChaseNoteInput): Promise<QuoteChaseEntry> {
  const problem = quoteChaseNoteProblem(input)
  if (problem) throw new Error(problem)
  const { data, error } = await db
    .from('quote_chase_log')
    .insert({
      quotation_id: input.quotation_id,
      chased_on: input.chased_on,
      channel: input.channel,
      contact: input.contact.trim(),
      note: input.note.trim(),
      response: input.response || '',
      next_follow_up: input.next_follow_up || null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as QuoteChaseEntry
}

export async function finishQuoteChaseTask(id: string, status: 'done' | 'skipped' | 'open', outcome = ''): Promise<void> {
  const { error } = await db.from('quote_chase_tasks').update({ status, outcome: outcome.slice(0, 2000) }).eq('id', id)
  if (error) throw error
}

export async function saveQuoteChaseSettings(settings: QuoteChaseSettings, tenantId: string, updatedBy: string): Promise<void> {
  const { error } = await db.from('quote_chase_settings').upsert(
    {
      tenant_id: tenantId,
      followup_days: settings.followupDays,
      expiry_warn_days: settings.expiryWarnDays,
      escalate_days: settings.escalateDays,
      escalate_to_user_id: settings.escalateToUserId,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id' },
  )
  if (error) throw error
}
