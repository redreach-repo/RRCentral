/**
 * Prospect outreach data calls. Every write goes through an rr_outreach_*
 * database function (the tables cannot be written directly), and sending goes
 * through the mail-inbox function, from the person's own Zoho mailbox.
 */
import { getSupabaseClient } from '../supabaseConfig'
import type {
  ImportBatch,
  ImportRow,
  OutreachMessage,
  OutreachSender,
  OutreachSettings,
  OutreachStatus,
  SheetRow,
} from './outreach'

const MESSAGE_COLUMNS =
  'id, account_id, contact_id, deal_id, sender_id, company, to_name, to_email, subject, body, signal_used, signal_url, country, data_source, checks_note, needs_enrichment, status, blocked_reason, approved_by, approved_at, decided_reason, sent_at, last_error, created_at, updated_at'

/** True when the outreach tables or functions are not in the database yet. */
export function isMissingSetup(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205' || error.code === 'PGRST202' || /does not exist|schema cache/i.test(error.message || '')
}

function fail(error: { message?: string } | null): never {
  throw new Error(error?.message || 'Something went wrong')
}

export async function listOutreachMessages(statuses: OutreachStatus[] | null): Promise<{ rows: OutreachMessage[]; missing: boolean; error: string }> {
  let q = getSupabaseClient()
    .from('outreach_messages')
    .select(MESSAGE_COLUMNS)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500)
  if (statuses) q = q.in('status', statuses)
  const { data, error } = await q
  if (error) return { rows: [], missing: isMissingSetup(error), error: error.message }
  return { rows: (data || []) as OutreachMessage[], missing: false, error: '' }
}

export async function getOutreachSettings(): Promise<OutreachSettings | null> {
  const { data, error } = await getSupabaseClient()
    .from('outreach_settings')
    .select('id, daily_cap, company_legal_name, company_address, opt_out_text, timezone')
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()
  if (error) return null
  return (data as OutreachSettings) || null
}

export async function saveOutreachSettings(s: Pick<OutreachSettings, 'daily_cap' | 'company_legal_name' | 'company_address' | 'opt_out_text'>): Promise<OutreachSettings> {
  const { data, error } = await getSupabaseClient().rpc('rr_outreach_save_settings', {
    p_daily_cap: s.daily_cap,
    p_legal_name: s.company_legal_name,
    p_address: s.company_address,
    p_opt_out_text: s.opt_out_text,
  })
  if (error) fail(error)
  return data as OutreachSettings
}

/** The company address from Settings (app_settings "address"), to prefill outreach settings. */
export async function companyAddressFromSettings(): Promise<string> {
  const { data } = await getSupabaseClient().from('app_settings').select('key, value').in('key', ['address', 'companyAddress'])
  const rows = (data || []) as { key: string; value: unknown }[]
  const v = rows.find((r) => r.key === 'address')?.value ?? rows.find((r) => r.key === 'companyAddress')?.value
  return typeof v === 'string' ? v : ''
}

export async function myOutreachSender(): Promise<OutreachSender> {
  const { data, error } = await getSupabaseClient().rpc('rr_outreach_my_sender')
  if (error) fail(error)
  return data as OutreachSender
}

export async function listOutreachSenders(): Promise<OutreachSender[]> {
  const { data } = await getSupabaseClient()
    .from('outreach_senders')
    .select('id, user_id, email, display_name, signature, active')
    .is('deleted_at', null)
    .order('email')
  return (data || []) as OutreachSender[]
}

export async function saveOutreachSender(id: string, displayName: string, signature: string, active = true): Promise<OutreachSender> {
  const { data, error } = await getSupabaseClient().rpc('rr_outreach_save_sender', {
    p_id: id,
    p_display_name: displayName,
    p_signature: signature,
    p_active: active,
  })
  if (error) fail(error)
  return data as OutreachSender
}

export async function stageImport(fileName: string, rows: SheetRow[]): Promise<ImportBatch> {
  const { data, error } = await getSupabaseClient().rpc('rr_outreach_import_stage', { p_file_name: fileName, p_rows: rows })
  if (error) fail(error)
  return data as ImportBatch
}

export async function listImportRows(batchId: string): Promise<ImportRow[]> {
  const { data, error } = await getSupabaseClient()
    .from('outreach_import_rows')
    .select('id, row_number, company, contact_name, title, email, country, signal_used, result, reason')
    .eq('batch_id', batchId)
    .order('row_number')
  if (error) fail(error)
  return (data || []) as ImportRow[]
}

export async function listImportBatches(): Promise<ImportBatch[]> {
  const { data } = await getSupabaseClient()
    .from('outreach_import_batches')
    .select('id, file_name, status, row_count, new_count, enrichment_count, duplicate_count, blocked_count, error_count, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(20)
  return (data || []) as ImportBatch[]
}

export async function commitImport(batchId: string): Promise<number> {
  const { data, error } = await getSupabaseClient().rpc('rr_outreach_import_commit', { p_batch_id: batchId })
  if (error) fail(error)
  return Number((data as { created?: number })?.created || 0)
}

export async function editOutreach(id: string, toEmail: string, subject: string, body: string): Promise<OutreachMessage> {
  const { data, error } = await getSupabaseClient().rpc('rr_outreach_edit', { p_id: id, p_to_email: toEmail, p_subject: subject, p_body: body })
  if (error) fail(error)
  return data as OutreachMessage
}

export async function decideOutreach(id: string, decision: 'approve' | 'reject' | 'pass' | 'reopen', reason = ''): Promise<OutreachMessage> {
  const { data, error } = await getSupabaseClient().rpc('rr_outreach_decide', { p_id: id, p_decision: decision, p_reason: reason })
  if (error) fail(error)
  return data as OutreachMessage
}

export async function releaseStuckSend(id: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('rr_outreach_release_stuck', { p_id: id })
  if (error) fail(error)
}

export async function outreachToday(): Promise<{ sent_today: number; daily_cap: number } | null> {
  const { data, error } = await getSupabaseClient().rpc('rr_outreach_today')
  if (error) return null
  return data as { sent_today: number; daily_cap: number }
}

export async function loadBlocklist(source: 'compman' | 'ctrm_next', rows: { company: string; domain: string }[]): Promise<number> {
  let added = 0
  for (let i = 0; i < rows.length; i += 5000) {
    const { data, error } = await getSupabaseClient().rpc('rr_outreach_blocklist_load', { p_source: source, p_rows: rows.slice(i, i + 5000) })
    if (error) fail(error)
    added += Number((data as { added?: number })?.added || 0)
  }
  return added
}

export async function blocklistCounts(): Promise<{ compman: number; ctrm_next: number; suppressed: number }> {
  const db = getSupabaseClient()
  const [c, n, s] = await Promise.all([
    db.from('external_blocklist').select('id', { count: 'exact', head: true }).eq('source', 'compman').is('deleted_at', null),
    db.from('external_blocklist').select('id', { count: 'exact', head: true }).eq('source', 'ctrm_next').is('deleted_at', null),
    db.from('outreach_suppressions').select('id', { count: 'exact', head: true }).is('deleted_at', null),
  ])
  return { compman: c.count || 0, ctrm_next: n.count || 0, suppressed: s.count || 0 }
}

export async function suppressAddress(value: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('rr_outreach_suppress', { p_value: value, p_reason: 'manual' })
  if (error) fail(error)
}

/** Send one approved email from the person's own Zoho mailbox (mail-inbox, action outreach_send). */
export async function sendOutreach(id: string): Promise<{ messageId: string; recorded: boolean }> {
  const { data, error } = await getSupabaseClient().functions.invoke('mail-inbox', { body: { action: 'outreach_send', id } })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const detail = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null
    const msg = (detail as { error?: string } | null)?.error
    if (ctx?.status === 404) throw new Error('The mail service is not deployed yet. Deploy mail-inbox from Actions, Deploy Edge Functions.')
    throw new Error(msg || error.message || 'The email was not sent')
  }
  const res = data as { ok?: boolean; messageId?: string; recorded?: boolean; error?: string }
  if (res?.error) throw new Error(res.error)
  return { messageId: String(res?.messageId || ''), recorded: res?.recorded !== false }
}
