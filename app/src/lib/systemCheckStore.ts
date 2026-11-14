import { subDays } from 'date-fns'
import { db } from './db'
import { isMissingRelationError, isUndefinedColumnError } from './errors'
import { listAppErrors } from './errorReporting'
import {
  digestSignalAtFromJson,
  summarizeOutboxHealth,
  type OutboxHealth,
} from './eventOutboxWorker'
import { parseHubSpotNudge } from './hubspotSync'
import { getSupabaseClient, getSupabaseRuntimeConfig } from './supabaseConfig'
import { checkFunction, lastFunctionErrors, readPing, SYSTEM_FUNCTIONS, type FunctionCheck, type PingResult } from './systemCheck'

/** Ping one function. The wrapper answers ?ping=1 without running it. */
export async function pingFunction(name: string, accessToken: string): Promise<PingResult> {
  const cfg = getSupabaseRuntimeConfig()
  if (!cfg.url) return readPing(0, { error: 'Supabase is not connected' })
  try {
    const res = await fetch(`${cfg.url.replace(/\/$/, '')}/functions/v1/${name}?ping=1`, {
      method: 'POST',
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${accessToken || cfg.anonKey}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(20_000),
    })
    const body = await res.json().catch(() => ({}))
    return readPing(res.status, body)
  } catch (e) {
    return readPing(0, { error: e instanceof Error && e.name === 'TimeoutError' ? 'No answer in 20 seconds' : 'Could not reach the function' })
  }
}

async function countOutboxStatus(status: string): Promise<number> {
  const { count, error } = await db.from('event_outbox').select('id', { count: 'exact', head: true }).eq('status', status)
  if (error) {
    if (isMissingRelationError(error) || isUndefinedColumnError(error)) return 0
    throw error
  }
  return count ?? 0
}

/** Queue depth + pending HubSpot/digest nudges for the System check card. */
export async function loadOutboxHealth(): Promise<OutboxHealth | null> {
  try {
    const [pending, processing, failed, settings] = await Promise.all([
      countOutboxStatus('pending'),
      countOutboxStatus('processing'),
      countOutboxStatus('failed'),
      db
        .from('app_settings')
        .select('key, value')
        .in('key', ['hubspot_sync_requested_at', 'digest_attention_signal']),
    ])
    if (settings.error && !isMissingRelationError(settings.error) && !isUndefinedColumnError(settings.error)) {
      throw settings.error
    }
    const byKey = new Map<string, string>()
    for (const row of settings.data || []) {
      if (row && typeof row.key === 'string' && typeof row.value === 'string') byKey.set(row.key, row.value)
    }
    return summarizeOutboxHealth({
      counts: { pending, processing, failed },
      hubspotNudgeAt: parseHubSpotNudge(byKey.get('hubspot_sync_requested_at')),
      digestSignalAt: digestSignalAtFromJson(byKey.get('digest_attention_signal')),
    })
  } catch (e) {
    if (isMissingRelationError(e) || isUndefinedColumnError(e)) return null
    throw e
  }
}

/** Ping every function and pair it with its last failure (last 30 days). */
export async function runSystemCheck(): Promise<FunctionCheck[]> {
  const { data } = await getSupabaseClient().auth.getSession()
  const token = data.session?.access_token || ''
  const [pings, errors] = await Promise.all([
    Promise.all(SYSTEM_FUNCTIONS.map((fn) => pingFunction(fn.name, token))),
    listAppErrors(subDays(new Date(), 30).toISOString()).catch(() => []),
  ])
  const last = lastFunctionErrors(errors)
  return SYSTEM_FUNCTIONS.map((fn, i) => checkFunction(fn, pings[i], last.get(fn.name) ?? null))
}
