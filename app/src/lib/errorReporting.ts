import { db, currentAuthMode } from './db'

/**
 * Error monitoring: errors people hit in the app are saved to app_errors
 * (admins read them on the App errors page and in the daily digest email),
 * so a failure is noticed before a client mentions it.
 */

export type AppErrorKind = 'browser' | 'crash' | 'function'

export type AppError = {
  id: number
  created_at: string
  kind: AppErrorKind
  message: string
  detail: string
  page: string
  user_email: string
  user_agent: string
  release: string
}

/** Reports kept per page load, so a loop cannot flood the table. */
export const MAX_REPORTS_PER_SESSION = 20

/** Browser noise that is not a fault in RR Central. */
const IGNORED = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Failed to fetch dynamically imported module/i,
  /Load failed$/i,
  /AbortError/i,
  /extension:\/\//i,
]

export function shouldReport(message: string): boolean {
  const m = message.trim()
  return Boolean(m) && !IGNORED.some((re) => re.test(m))
}

/** A short, stable key for "the same error": message without numbers and ids. */
export function errorKey(message: string): string {
  return message
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, '#')
    .replace(/\d+/g, '#')
    .slice(0, 200)
}

export function describeError(value: unknown): { message: string; detail: string } {
  if (value instanceof Error) return { message: value.message || value.name, detail: value.stack || '' }
  if (typeof value === 'string') return { message: value, detail: '' }
  if (value && typeof value === 'object' && 'message' in value) {
    const v = value as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    return {
      message: String(v.message || 'Unknown error'),
      detail: [v.code, v.details, v.hint].filter(Boolean).map(String).join('\n'),
    }
  }
  try {
    return { message: JSON.stringify(value).slice(0, 500) || 'Unknown error', detail: '' }
  } catch {
    return { message: 'Unknown error', detail: '' }
  }
}

/** Group errors by message for the admin view, newest first. */
export function groupErrors(errors: AppError[]): { key: string; latest: AppError; count: number; people: string[] }[] {
  const groups = new Map<string, { key: string; latest: AppError; count: number; people: Set<string> }>()
  for (const e of errors) {
    const key = errorKey(e.message)
    const g = groups.get(key)
    if (!g) groups.set(key, { key, latest: e, count: 1, people: new Set(e.user_email ? [e.user_email] : []) })
    else {
      g.count++
      if (e.created_at > g.latest.created_at) g.latest = e
      if (e.user_email) g.people.add(e.user_email)
    }
  }
  return [...groups.values()]
    .map((g) => ({ ...g, people: [...g.people].sort() }))
    .sort((a, b) => b.latest.created_at.localeCompare(a.latest.created_at))
}

const sent = new Set<string>()
let count = 0

export async function reportError(kind: AppErrorKind, value: unknown): Promise<void> {
  try {
    if (currentAuthMode() !== 'supabase') return
    const { message, detail } = describeError(value)
    if (!shouldReport(message)) return
    const key = `${kind}|${errorKey(message)}`
    if (sent.has(key) || count >= MAX_REPORTS_PER_SESSION) return
    sent.add(key)
    count++
    await db.from('app_errors').insert({
      kind,
      message: message.slice(0, 1000),
      detail: detail.slice(0, 4000),
      page: `${window.location.pathname}${window.location.hash ? '#…' : ''}`.slice(0, 500),
      user_agent: navigator.userAgent.slice(0, 500),
      release: String(import.meta.env.VITE_RELEASE || import.meta.env.MODE || '').slice(0, 100),
    })
  } catch {
    // Never let reporting an error cause another one.
  }
}

let installed = false

/** Catch errors nothing else handled. Called once from main.tsx. */
export function installErrorReporting(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('error', (event) => {
    void reportError('browser', event.error ?? event.message)
  })
  window.addEventListener('unhandledrejection', (event) => {
    void reportError('browser', event.reason)
  })
}

export async function listAppErrors(sinceIso: string): Promise<AppError[]> {
  const { data, error } = await db
    .from('app_errors')
    .select('*')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return (data || []) as AppError[]
}

export async function clearAppErrors(ids: number[]): Promise<void> {
  if (!ids.length) return
  const { error } = await db.from('app_errors').delete().in('id', ids)
  if (error) throw error
}
