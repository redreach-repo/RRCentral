import { db, isSupabaseConfigured } from './db'
import { isMissingRelationError } from './errors'
import { paidByReference } from './contractBillingStore'
import {
  buildAgingRows,
  chaseSettingsFrom,
  isoDate,
  planChaseTasks,
  tasksToClose,
  type AgingInvoice,
  type AgingRow,
  type ChaseChannel,
  type ChaseLogEntry,
  type ChaseSettings,
  type ChaseSettingsRow,
  type ChaseTask,
} from './arChase'

/**
 * Overdue invoice chasing: loads and saves for the Aging page, the invoice
 * chase log and the dashboard card. Rules live in arChase.ts.
 * Tables: supabase/migrations/20261328090000_ar_chase.sql. Until that SQL is
 * run, everything reads as empty and `setupMissing` is true.
 */

export type AgingData = {
  rows: AgingRow[]
  tasks: ChaseTask[]
  log: ChaseLogEntry[]
  settings: ChaseSettings
  /** The chase tables are not in the database yet. */
  setupMissing: boolean
  ownerByAccount: Map<string, string>
}

const CHASE_TABLES = new Set(['ar_chase_settings', 'invoice_chase_log', 'invoice_chase_tasks'])

/** Local mode (no Supabase) has no chase tables: they read as not set up. */
function chaseTablesMissing(table: string): boolean {
  return CHASE_TABLES.has(table) && !isSupabaseConfigured()
}

async function tableRows<T>(
  build: () => PromiseLike<{ data: unknown; error: unknown }>,
  table = '',
): Promise<{ rows: T[]; missing: boolean }> {
  if (chaseTablesMissing(table)) return { rows: [], missing: true }
  try {
    const { data, error } = await build()
    if (error) {
      if (isMissingRelationError(error)) return { rows: [], missing: true }
      throw error
    }
    return { rows: (data || []) as T[], missing: false }
  } catch (e) {
    if (isMissingRelationError(e)) return { rows: [], missing: true }
    throw e
  }
}

export async function loadChaseSettings(): Promise<{ settings: ChaseSettings; missing: boolean }> {
  const res = await tableRows<ChaseSettingsRow>(() => db.from('ar_chase_settings').select('*').limit(1), 'ar_chase_settings')
  return { settings: chaseSettingsFrom(res.rows[0]), missing: res.missing }
}

export async function loadAgingData(today: Date = new Date()): Promise<AgingData> {
  const [inv, paid, log, tasks, settings, accounts] = await Promise.all([
    tableRows<AgingInvoice & { deleted_at?: string | null }>(() => db.from('invoices').select('*')),
    paidByReference(),
    tableRows<ChaseLogEntry>(() => db.from('invoice_chase_log').select('*'), 'invoice_chase_log'),
    tableRows<ChaseTask>(() => db.from('invoice_chase_tasks').select('*'), 'invoice_chase_tasks'),
    loadChaseSettings(),
    tableRows<{ id: string; owner_user_id: string | null }>(() => db.from('accounts').select('id, owner_user_id')),
  ])
  const liveLog = log.rows.filter((e) => !e.deleted_at)
  const ownerByAccount = new Map(accounts.rows.filter((a) => a.owner_user_id).map((a) => [a.id, a.owner_user_id as string]))
  const rows = buildAgingRows({
    invoices: inv.rows.filter((i) => !i.deleted_at),
    paid,
    log: liveLog,
    tasks: tasks.rows,
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
  }
}

/**
 * Adds the task for each step an overdue invoice has reached, and closes
 * open tasks on invoices that are paid. Safe to call on every page load: one
 * task per invoice and step (the database refuses a second). Returns how
 * many tasks were added. Only for sales and up (the database checks too).
 */
export async function syncChaseTasks(data: AgingData): Promise<number> {
  if (data.setupMissing) return 0
  const plan = planChaseTasks({ rows: data.rows, tasks: data.tasks, settings: data.settings, ownerByAccount: data.ownerByAccount })
  const close = tasksToClose(data.tasks, data.rows)
  if (plan.length) {
    const { error } = await db.from('invoice_chase_tasks').upsert(plan, { onConflict: 'invoice_id,step_day', ignoreDuplicates: true })
    if (error) throw error
  }
  if (close.length) {
    const { error } = await db.from('invoice_chase_tasks').update({ status: 'closed', outcome: 'Invoice paid or no longer owing.' }).in('id', close)
    if (error) throw error
  }
  return plan.length
}

export async function listChaseLog(invoiceId: string): Promise<{ log: ChaseLogEntry[]; missing: boolean }> {
  const res = await tableRows<ChaseLogEntry>(() => db.from('invoice_chase_log').select('*').eq('invoice_id', invoiceId), 'invoice_chase_log')
  return { log: res.rows.filter((e) => !e.deleted_at), missing: res.missing }
}

export type ChaseNoteInput = {
  invoice_id: string
  chased_on: string
  channel: ChaseChannel
  contact: string
  note: string
  promised_date: string | null
}

/** Problem with a chase note before it is saved, or null. */
export function chaseNoteProblem(input: ChaseNoteInput, today: Date = new Date()): string | null {
  if (!input.chased_on || !/^\d{4}-\d{2}-\d{2}$/.test(input.chased_on)) return 'Pick the date of the chase.'
  if (input.chased_on > isoDate(new Date(today.getTime() + 86_400_000))) return 'The chase date cannot be in the future.'
  if (input.promised_date && input.promised_date < input.chased_on) return 'The promised date cannot be before the chase.'
  if (!input.note.trim() && !input.promised_date) return 'Add a note or a promised payment date.'
  if (input.note.length > 4000) return 'The note is too long (4,000 characters at most).'
  if (input.contact.length > 200) return 'The contact is too long.'
  return null
}

export async function addChaseNote(input: ChaseNoteInput): Promise<ChaseLogEntry> {
  const problem = chaseNoteProblem(input)
  if (problem) throw new Error(problem)
  const { data, error } = await db
    .from('invoice_chase_log')
    .insert({
      invoice_id: input.invoice_id,
      chased_on: input.chased_on,
      channel: input.channel,
      contact: input.contact.trim(),
      note: input.note.trim(),
      promised_date: input.promised_date || null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as ChaseLogEntry
}

export async function finishChaseTask(id: string, status: 'done' | 'skipped' | 'open', outcome = ''): Promise<void> {
  const { error } = await db.from('invoice_chase_tasks').update({ status, outcome: outcome.slice(0, 2000) }).eq('id', id)
  if (error) throw error
}

export async function saveChaseSettings(settings: ChaseSettings, tenantId: string, updatedBy: string): Promise<void> {
  const { error } = await db.from('ar_chase_settings').upsert(
    {
      tenant_id: tenantId,
      reminder_days: settings.reminderDays,
      escalate_days: settings.escalateDays,
      escalate_to_user_id: settings.escalateToUserId,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id' },
  )
  if (error) throw error
}
