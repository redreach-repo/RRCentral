import { db } from './db'
import { isMissingRelationError, isUndefinedColumnError } from './errors'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'
import { parsePhoneList } from './usageImport'
import type { UsageImportRun, UsageSourceRow } from './types'

export async function getUsageSource(accountId: string): Promise<UsageSourceRow | null> {
  const { data, error } = await db.from('usage_sources').select('*').eq('account_id', accountId)
  if (error) {
    if (isMissingRelationError(error)) return null
    throw error
  }
  return ((data || []) as UsageSourceRow[])[0] ?? null
}

/** Save the WhatsApp numbers (typed in one box) and AI workspace for a client. */
export async function saveUsageSource(
  accountId: string,
  input: { phones: string; workspace: string },
  existing: UsageSourceRow | null,
  by: string,
): Promise<void> {
  const row = {
    whatsapp_phones: parsePhoneList(input.phones),
    ai_workspace_id: input.workspace.trim(),
    updated_by: by,
    updated_at: new Date().toISOString(),
  }
  const { error } = existing
    ? await db.from('usage_sources').update(row).eq('id', existing.id)
    : await db.from('usage_sources').insert({ ...row, id: crypto.randomUUID(), account_id: accountId })
  if (error) throw error
}

export async function listImportRuns(limit = 5): Promise<UsageImportRun[]> {
  const { data, error } = await db.from('usage_import_runs').select('*').order('started_at', { ascending: false })
  if (error) {
    if (isMissingRelationError(error) || isUndefinedColumnError(error)) return []
    throw error
  }
  return ((data || []) as UsageImportRun[]).slice(0, limit)
}

export type ImportResult =
  | {
      ok: true
      whatsapp: 'ok' | 'not_configured' | 'error'
      ai: 'ok' | 'not_configured' | 'error'
      written: number
      skipped: number
      clientsLinked: number
      message: string
    }
  | { ok: false; message: string }

/** Run the usage-import Edge Function now, as the signed in manager or admin. */
export async function runUsageImport(): Promise<ImportResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: 'Local mode cannot reach Meta or Anthropic. Enter usage by hand on each client.' }
  }
  const { data, error } = await getSupabaseClient().functions.invoke('usage-import', { body: {} })
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status
    if (status === 404 || /Failed to send a request/i.test(String((error as Error).message))) {
      return { ok: false, message: 'The usage-import function is not deployed yet. See docs/usage-import.md.' }
    }
    let message = 'The import did not finish.'
    try {
      const body = await (error as { context?: Response }).context?.json()
      if (body?.error) message = String(body.error)
    } catch {
      // keep the plain message
    }
    return { ok: false, message }
  }
  return { ok: true, ...(data as Omit<Extract<ImportResult, { ok: true }>, 'ok'>) }
}

export const SOURCE_STATUS_LABEL: Record<string, string> = {
  ok: 'imported',
  not_configured: 'not set up yet',
  error: 'failed',
  '': 'not run',
}
