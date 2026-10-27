/**
 * HubSpot: RR Central pushes accounts, contacts and AI CRM deals to HubSpot,
 * one way. The hubspot-sync Edge Function holds the HubSpot token; the browser
 * only starts a sync and reads the run log (managers and admins).
 */

import { db } from './db'
import { isMissingRelationError, isUndefinedColumnError } from './errors'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'

export interface HubSpotSyncRun {
  id: string
  started_at: string
  finished_at: string | null
  trigger: 'manual' | 'schedule'
  requested_by: string
  companies_created: number
  companies_updated: number
  contacts_created: number
  contacts_updated: number
  deals_created: number
  deals_updated: number
  failed: number
  more_to_do: boolean
  message: string
}

export async function listHubSpotRuns(limit = 5): Promise<HubSpotSyncRun[]> {
  const { data, error } = await db.from('hubspot_sync_runs').select('*').order('started_at', { ascending: false })
  if (error) {
    if (isMissingRelationError(error) || isUndefinedColumnError(error)) return []
    throw error
  }
  return ((data || []) as HubSpotSyncRun[]).slice(0, limit)
}

/** "2 companies, 5 contacts and 1 deal sent" style line for a run. */
export function runSummary(r: Pick<HubSpotSyncRun, 'companies_created' | 'companies_updated' | 'contacts_created' | 'contacts_updated' | 'deals_created' | 'deals_updated' | 'failed' | 'finished_at'>): string {
  if (!r.finished_at) return 'Running…'
  const part = (n: number, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : '')
  const sent = [
    part(r.companies_created + r.companies_updated, 'company', 'companies'),
    part(r.contacts_created + r.contacts_updated, 'contact', 'contacts'),
    part(r.deals_created + r.deals_updated, 'deal', 'deals'),
  ].filter(Boolean)
  const words = sent.length > 1 ? `${sent.slice(0, -1).join(', ')} and ${sent[sent.length - 1]}` : sent[0] || ''
  const base = words ? `${words} sent` : 'Nothing new to send'
  return r.failed ? `${base}, ${r.failed} failed` : base
}

export type HubSpotSyncResult = { ok: true; summary: string; message: string } | { ok: false; message: string }

/** Run the hubspot-sync Edge Function now, as the signed in manager or admin. */
export async function runHubSpotSync(): Promise<HubSpotSyncResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: 'HubSpot needs RR Central connected to Supabase.' }
  const { data, error } = await getSupabaseClient().functions.invoke('hubspot-sync', { body: {} })
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status
    if (status === 404 || /Failed to send a request/i.test(String((error as Error).message))) {
      return { ok: false, message: 'The hubspot-sync function is not deployed yet. See docs/hubspot-sync.md.' }
    }
    let message = 'The sync did not finish.'
    try {
      const body = await (error as { context?: Response }).context?.json()
      if (body?.error) message = String(body.error)
    } catch {
      // keep the plain message
    }
    return { ok: false, message }
  }
  const run = data as HubSpotSyncRun
  return { ok: true, summary: runSummary({ ...run, finished_at: 'now' }), message: String(run.message || '') }
}
