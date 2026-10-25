import { subDays } from 'date-fns'
import { listAppErrors } from './errorReporting'
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
