import { db } from './db'
import { isMissingRelationError } from './errors'
import { logAccountEvent } from './accountsStore'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'
import { sanitiseTenants } from './worshiphub'
import type { WorshipChurchProfile, WorshipTenant } from './types'

type Author = { appUserId: string | null; email: string }

export type ChurchDetailsInput = Pick<
  WorshipChurchProfile,
  | 'tenant_slug'
  | 'plan'
  | 'modules'
  | 'whatsapp_month'
  | 'whatsapp_conversations'
  | 'billing_status'
  | 'renewal_date'
  | 'admin_url'
  | 'notes'
>

export async function listChurchProfiles(): Promise<WorshipChurchProfile[]> {
  const { data, error } = await db.from('worship_church_profiles').select('*')
  if (error) {
    if (isMissingRelationError(error)) return []
    throw error
  }
  return (data || []) as WorshipChurchProfile[]
}

export async function saveChurchProfile(
  accountId: string,
  input: ChurchDetailsInput,
  existing: WorshipChurchProfile | null,
  author: Author,
): Promise<void> {
  const now = new Date().toISOString()
  if (existing) {
    const { error } = await db
      .from('worship_church_profiles')
      .update({ ...input, updated_by: author.email, updated_at: now })
      .eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await db.from('worship_church_profiles').insert({
      ...input,
      id: crypto.randomUUID(),
      account_id: accountId,
      updated_by: author.email,
      created_at: now,
      updated_at: now,
    })
    if (error) throw error
  }
  await logAccountEvent(accountId, 'WorshipHub details updated by hand', author)
}

export type LiveResult =
  | { connected: true; fetchedAt: string; tenants: WorshipTenant[] }
  | { connected: false; reason: 'local' | 'not_configured' | 'not_deployed' | 'unreachable'; message: string }

const NOT_CONNECTED: Record<string, string> = {
  local: 'This copy of RR Central runs in local mode, so it cannot reach WorshipHub.',
  not_configured: 'The WorshipHub connection is not set up yet.',
  not_deployed: 'The worshiphub-read function is not deployed yet.',
  unreachable: 'WorshipHub did not answer.',
}

/** Live account level data from WorshipHub through the worshiphub-read Edge Function. */
export async function fetchLiveTenants(): Promise<LiveResult> {
  if (!isSupabaseConfigured()) return { connected: false, reason: 'local', message: NOT_CONNECTED.local }
  const { data, error } = await getSupabaseClient().functions.invoke('worshiphub-read', { body: {} })
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status
    const missing = status === 404 || /Failed to send a request/i.test(String((error as Error).message))
    return missing
      ? { connected: false, reason: 'not_deployed', message: NOT_CONNECTED.not_deployed }
      : { connected: false, reason: 'unreachable', message: NOT_CONNECTED.unreachable }
  }
  const body = (data || {}) as { connected?: boolean; reason?: string; message?: string; fetched_at?: string; tenants?: unknown }
  if (!body.connected) {
    const reason = body.reason === 'not_configured' ? 'not_configured' : 'unreachable'
    return { connected: false, reason, message: body.message ? `${NOT_CONNECTED[reason]} ${body.message}.` : NOT_CONNECTED[reason] }
  }
  return { connected: true, fetchedAt: body.fetched_at || new Date().toISOString(), tenants: sanitiseTenants(body) }
}
