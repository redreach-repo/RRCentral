import { db } from './db'
import { isMissingRelationError } from './errors'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'
import type { ClientReportDraft } from './types'

export type ReportContact = { id: string; account_id: string; name: string; email: string; phone: string; whatsapp: string; is_primary: boolean }

export type ReportQueue = {
  drafts: (ClientReportDraft & { accountName: string })[]
  contacts: ReportContact[]
  missingTable: boolean
}

/** One month's report drafts, with the account names and contacts. */
export async function loadReportQueue(month: string): Promise<ReportQueue> {
  const { data, error } = await db.from('client_report_drafts').select('*').eq('month', month)
  if (error) {
    if (isMissingRelationError(error)) return { drafts: [], contacts: [], missingTable: true }
    throw error
  }
  const rows = (data || []) as ClientReportDraft[]
  const ids = [...new Set(rows.map((r) => r.account_id))]
  if (!ids.length) return { drafts: [], contacts: [], missingTable: false }
  const [{ data: accounts }, { data: contacts }] = await Promise.all([
    db.from('accounts').select('id, name').in('id', ids),
    db.from('account_contacts').select('id, account_id, name, email, phone, whatsapp, is_primary').in('account_id', ids),
  ])
  const names = new Map(((accounts || []) as { id: string; name: string }[]).map((a) => [a.id, a.name]))
  const drafts = rows
    .map((r) => ({ ...r, accountName: names.get(r.account_id) || 'Unknown account' }))
    .sort((a, b) => a.accountName.localeCompare(b.accountName))
  return { drafts, contacts: (contacts || []) as ReportContact[], missingTable: false }
}

export async function saveReportSummary(id: string, summary: string): Promise<void> {
  const { error } = await db.from('client_report_drafts').update({ summary: summary.trim() }).eq('id', id)
  if (error) throw error
}

export async function setReportSkipped(id: string, skipped: boolean): Promise<void> {
  const { error } = await db.from('client_report_drafts').update({ status: skipped ? 'skipped' : 'draft' }).eq('id', id)
  if (error) throw error
}

export type ReportCallResult<T> = { ok: true; data: T } | { ok: false; message: string }

async function callReports<T>(body: Record<string, unknown>, fallback: string): Promise<ReportCallResult<T>> {
  if (!isSupabaseConfigured()) return { ok: false, message: 'Local mode cannot build or send reports.' }
  const { data, error } = await getSupabaseClient().functions.invoke('client-reports', { body })
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status
    if (status === 404 || /Failed to send a request/i.test(String((error as Error).message))) {
      return { ok: false, message: 'The client-reports function is not deployed yet.' }
    }
    try {
      const b = await (error as { context?: Response }).context?.json()
      return { ok: false, message: String(b?.error || fallback) }
    } catch {
      return { ok: false, message: fallback }
    }
  }
  return { ok: true, data: data as T }
}

/** Builds any missing drafts for the month now (managers and admins). */
export function buildReportDrafts(month: string) {
  return callReports<{ month: string; drafted: string[]; problems: string[] }>({ action: 'build', month }, 'The drafts were not built.')
}

/** Sends one approved report. Only the function sends. */
export function sendReport(draftId: string, channels: ('email' | 'whatsapp')[], summary: string) {
  return callReports<{ sent: { channel: string; to: string }[]; failed: string[] }>(
    { action: 'send', draft_id: draftId, channels, summary },
    'The report was not sent.',
  )
}
