import { db } from './db'
import type { ExportDecision } from './exportPolicy'

/**
 * Sales safeguards (migration 20261333090000_sales_safeguards.sql): the CSV
 * export log and cap, sign in history, and the leaver button.
 */

export type SignInRow = { id: string; at: string; user_agent: string; two_step: boolean }
export type ExportRow = { id: string; at: string; filename: string; row_count: number; allowed: boolean }
export type OffboardResult = {
  accounts: number
  leads: number
  switches: number
  projects: number
  ai_keys: number
  sessions: number
  handed_to: string
}

/** Logs a CSV download and returns the server's decision. Throws when the function is missing. */
export async function logExportOnServer(filename: string, rows: number): Promise<ExportDecision | null> {
  const { data, error } = await db.rpc('rr_log_export', { p_filename: filename, p_rows: rows })
  if (error) throw new Error(error.message)
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  return {
    allowed: d.allowed !== false,
    reason: typeof d.reason === 'string' ? d.reason : undefined,
    used: typeof d.used === 'number' ? d.used : undefined,
    cap: typeof d.cap === 'number' ? d.cap : null,
  }
}

const SIGN_IN_KEY = 'rr_sign_in_recorded'

/** Records this sign in once per browser tab session. Never throws. */
export async function recordSignInOnce(userId: string, twoStep: boolean): Promise<void> {
  try {
    if (sessionStorage.getItem(SIGN_IN_KEY) === userId) return
  } catch {
    /* storage blocked: the server ignores repeats within a minute anyway */
  }
  try {
    const agent = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    const { error } = await db.rpc('rr_record_sign_in', { p_user_agent: agent, p_two_step: twoStep })
    if (error) return
    try {
      sessionStorage.setItem(SIGN_IN_KEY, userId)
    } catch {
      /* ignore */
    }
  } catch {
    /* the safeguards SQL may not be on this database yet */
  }
}

export async function listSignIns(email: string, limit = 10): Promise<{ rows: SignInRow[]; missingTable: boolean }> {
  const { data, error } = await db
    .from('sign_in_log')
    .select('id, at, user_agent, two_step')
    .ilike('user_email', email.replace(/[\\%_]/g, '\\$&'))
    .order('at', { ascending: false })
    .limit(limit)
  if (error) return { rows: [], missingTable: /sign_in_log|does not exist|schema cache/i.test(error.message || '') }
  return { rows: (data || []) as SignInRow[], missingTable: false }
}

export async function listExports(email: string, limit = 10): Promise<{ rows: ExportRow[]; missingTable: boolean }> {
  const { data, error } = await db
    .from('export_log')
    .select('id, at, filename, row_count, allowed')
    .ilike('user_email', email.replace(/[\\%_]/g, '\\$&'))
    .order('at', { ascending: false })
    .limit(limit)
  if (error) return { rows: [], missingTable: /export_log|does not exist|schema cache/i.test(error.message || '') }
  return { rows: (data || []) as ExportRow[], missingTable: false }
}

export async function offboardUser(userId: string, handToUserId: string): Promise<OffboardResult> {
  const { data, error } = await db.rpc('rr_offboard_user', { p_user: userId, p_hand_to: handToUserId })
  if (error) throw new Error(error.message)
  return data as OffboardResult
}

/** Short browser name from a user agent, for the sign in list. */
export function browserLabel(agent: string): string {
  const a = agent || ''
  const os = /iPhone|iPad/.test(a) ? 'iPhone/iPad' : /Android/.test(a) ? 'Android' : /Mac OS X/.test(a) ? 'Mac' : /Windows/.test(a) ? 'Windows' : /Linux/.test(a) ? 'Linux' : ''
  const browser = /Edg\//.test(a) ? 'Edge' : /OPR\//.test(a) ? 'Opera' : /Firefox\//.test(a) ? 'Firefox' : /Chrome\//.test(a) ? 'Chrome' : /Safari\//.test(a) ? 'Safari' : ''
  const label = [browser, os].filter(Boolean).join(' on ')
  return label || (a ? a.slice(0, 40) : 'Unknown browser')
}

/** One line summary of the leaver button's work. */
export function offboardSummary(r: OffboardResult): string {
  const parts = [
    `${r.accounts} account(s) and ${r.leads} lead(s) handed to ${r.handed_to}`,
    r.projects ? `removed from ${r.projects} project(s)` : '',
    r.switches ? `${r.switches} switch(es) removed` : '',
    r.ai_keys ? `${r.ai_keys} AI key(s) revoked` : '',
    r.sessions ? 'signed out everywhere' : '',
  ].filter(Boolean)
  return `Switched off. ${parts.join(', ')}.`
}
