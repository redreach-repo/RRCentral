/** Stores for M13 DSR + retention. */
import { db } from './db'
import { isMissingRelationError } from './errors'
import { isSupabaseConfigured } from './supabaseConfig'
import type { DsrRequestType, DsrStatus } from './dsr/dsr'
import { nextDsrStatus } from './dsr/dsr'

export type DsrRequestRow = {
  id: string
  request_type: DsrRequestType
  subject_email: string
  subject_name: string
  account_id: string | null
  status: DsrStatus
  detail: string
  created_at: string
  completed_at: string | null
}

export async function listDsrRequests(): Promise<DsrRequestRow[]> {
  if (!isSupabaseConfigured()) return []
  const { data, error } = await db
    .from('dsr_requests')
    .select('id, request_type, subject_email, subject_name, account_id, status, detail, created_at, completed_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as DsrRequestRow[]
}

export async function createDsrRequest(input: {
  requestType: DsrRequestType
  subjectEmail: string
  subjectName?: string
  accountId?: string | null
  detail?: string
}): Promise<void> {
  const { error } = await db.from('dsr_requests').insert({
    request_type: input.requestType,
    subject_email: input.subjectEmail.trim().toLowerCase(),
    subject_name: input.subjectName || '',
    account_id: input.accountId || null,
    status: 'received',
    detail: input.detail || '',
  })
  if (error) throw error
}

export async function updateDsrStatus(id: string, action: 'start' | 'complete' | 'reject'): Promise<void> {
  const { data: row, error: rErr } = await db.from('dsr_requests').select('status').eq('id', id).maybeSingle()
  if (rErr) throw rErr
  if (!row) throw new Error('DSR request not found')
  const next = nextDsrStatus(row.status as DsrStatus, action)
  if (!next) throw new Error(`Cannot ${action} from ${row.status}`)
  const patch: Record<string, unknown> = { status: next, updated_at: new Date().toISOString() }
  if (next === 'completed' || next === 'rejected') patch.completed_at = new Date().toISOString()
  const { error } = await db.from('dsr_requests').update(patch).eq('id', id)
  if (error) throw error
}

export async function runRetentionPrune(): Promise<{ app_errors_deleted: number; audit_deleted: number }> {
  const { data, error } = await db.rpc('rr_retention_run')
  if (error) throw error
  const row = data as { app_errors_deleted?: number; audit_deleted?: number }
  return {
    app_errors_deleted: Number(row?.app_errors_deleted || 0),
    audit_deleted: Number(row?.audit_deleted || 0),
  }
}

export async function anonymizeContact(contactId: string): Promise<void> {
  const { error } = await db.rpc('rr_dsr_anonymize_contact', { p_contact: contactId })
  if (error) throw error
}

export type RetentionRunRow = {
  id: string
  ran_by: string | null
  app_errors_deleted: number
  audit_deleted: number
  detail: string
  created_at: string
}

export async function listRetentionRuns(): Promise<RetentionRunRow[]> {
  if (!isSupabaseConfigured()) return []
  const { data, error } = await db
    .from('retention_runs')
    .select('id, ran_by, app_errors_deleted, audit_deleted, detail, created_at')
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return ((data || []) as RetentionRunRow[]).map((r) => ({
    id: String(r.id),
    ran_by: r.ran_by || null,
    app_errors_deleted: Number(r.app_errors_deleted) || 0,
    audit_deleted: Number(r.audit_deleted) || 0,
    detail: String(r.detail || ''),
    created_at: String(r.created_at || ''),
  }))
}
