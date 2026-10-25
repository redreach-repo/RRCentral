import type { AppError } from './errorReporting'

/**
 * System check: every Edge Function, pinged with ?ping=1 (the shared
 * withErrorLog wrapper answers without running the function), next to its
 * last failure from app_errors (kind 'function', function name in `page`).
 */

export type SystemFunction = {
  name: string
  /** What it does, in words. */
  feature: string
  /** The LIVE_TEST.md test that proves it end to end. */
  liveTest: string
}

export const SYSTEM_FUNCTIONS: SystemFunction[] = [
  { name: 'ai-assist', feature: 'AI help on accounts', liveTest: '1' },
  { name: 'usage-import', feature: 'WhatsApp and AI usage import', liveTest: '2' },
  { name: 'whatsapp-in', feature: 'WhatsApp messages into tickets', liveTest: '3' },
  { name: 'whatsapp-send', feature: 'WhatsApp replies from tickets', liveTest: '4' },
  { name: 'daily-digest', feature: 'Daily digest email and WhatsApp', liveTest: '5' },
  { name: 'client-portal', feature: 'Client portal link', liveTest: '6' },
  { name: 'support-email-in', feature: 'Support emails and WorshipHub tickets', liveTest: '7' },
  { name: 'worshiphub-read', feature: 'WorshipHub churches list', liveTest: '8' },
  { name: 'worshiphub-manage', feature: 'WorshipHub review buttons', liveTest: '8' },
  { name: 'zoho-proxy', feature: 'Zoho Mail and Books', liveTest: '9' },
  { name: 'manage-auth-user', feature: 'Set team login passwords', liveTest: '9' },
  { name: 'create-checkout-session', feature: 'Shop checkout (Stripe)', liveTest: '9' },
  { name: 'teetribe-order-sync', feature: 'Tee Tribe orders into RR Central', liveTest: '9' },
  { name: 'contract-invoices', feature: 'Contract invoices each morning', liveTest: '10' },
  { name: 'watchdog', feature: 'Daily watchdog list', liveTest: '11' },
  { name: 'payment-reminder', feature: 'One tap payment reminders', liveTest: '12' },
  { name: 'quote-accept', feature: 'Quote accept links', liveTest: '16' },
]

export type PingResult = {
  /** HTTP status, or 0 when the call did not get an answer. */
  status: number
  /** True when the answer came from the ping wrapper (deployed with this version). */
  ping: boolean
  /** Secrets the function reports as not set (admins only). */
  missing: string[]
  error: string
}

export type CheckState = 'green' | 'amber' | 'red'

export type FunctionCheck = {
  fn: SystemFunction
  state: CheckState
  reason: string
  lastError: AppError | null
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Read a ping answer into a PingResult. */
export function readPing(status: number, body: unknown): PingResult {
  const b = (body && typeof body === 'object' ? body : {}) as { ping?: unknown; missing?: unknown; error?: unknown }
  return {
    status,
    ping: b.ping === true,
    missing: Array.isArray(b.missing) ? b.missing.filter((m): m is string => typeof m === 'string') : [],
    error: typeof b.error === 'string' ? b.error : '',
  }
}

/**
 * Green: answers the ping, every secret set, no failure in the last day.
 * Amber: works but failed in the last day, or runs an older version without the ping.
 * Red: not deployed, cannot be reached, or a secret it needs is missing.
 */
export function checkFunction(fn: SystemFunction, ping: PingResult, lastError: AppError | null, now = new Date()): FunctionCheck {
  const base = { fn, lastError }
  if (ping.status === 0) return { ...base, state: 'red', reason: ping.error || 'Could not reach the function' }
  if (ping.status === 404) return { ...base, state: 'red', reason: 'Not deployed. Deploy it from Actions, Deploy Edge Functions.' }
  if (ping.status === 401 || ping.status === 403) {
    return ping.ping
      ? { ...base, state: 'red', reason: `Refused the check (${ping.status})` }
      : { ...base, state: 'amber', reason: 'Deployed, but an older version. Deploy it again to get the health check.' }
  }
  if (ping.status !== 200) return { ...base, state: 'red', reason: `Answered ${ping.status}${ping.error ? `: ${ping.error}` : ''}` }
  if (!ping.ping) return { ...base, state: 'amber', reason: 'Deployed, but an older version. Deploy it again to get the health check.' }
  if (ping.missing.length) return { ...base, state: 'red', reason: `Secret not set: ${ping.missing.join(', ')}` }
  if (lastError && now.getTime() - new Date(lastError.created_at).getTime() < DAY_MS) {
    return { ...base, state: 'amber', reason: 'Failed in the last 24 hours' }
  }
  return { ...base, state: 'green', reason: 'Working' }
}

/** Newest function failure per function name. */
export function lastFunctionErrors(errors: AppError[]): Map<string, AppError> {
  const out = new Map<string, AppError>()
  for (const e of errors) {
    if (e.kind !== 'function' || !e.page) continue
    const seen = out.get(e.page)
    if (!seen || e.created_at > seen.created_at) out.set(e.page, e)
  }
  return out
}

export function summarise(checks: FunctionCheck[]): Record<CheckState, number> {
  const out: Record<CheckState, number> = { green: 0, amber: 0, red: 0 }
  for (const c of checks) out[c.state]++
  return out
}
