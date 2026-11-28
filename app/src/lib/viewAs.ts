import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'

/**
 * Admin "View as user" (migration 20261335090000_admin_view_as.sql, Edge
 * Function admin-view-as). An admin who has passed two step sign in opens the
 * CRM as a team member, sees exactly what they see, and goes back with Stop.
 * The member's password and two step sign in are never used or weakened.
 *
 * While viewing, this browser keeps the admin's own sign in under RETURN_KEY
 * so Stop can put it back. Only the View as sign in session is ended on Stop:
 * never a global sign out, which would sign the real member out everywhere.
 */

export const RETURN_KEY = 'rr_view_as_return'

export type ViewAsInfo = { id: string; admin: string; targetEmail: string; expiresAt: string }

type Saved = { access_token: string; refresh_token: string; admin_email: string; id: string }

/** The database answer from rr_view_as_active(), or null when this is not a View as session. */
export function parseViewAs(raw: unknown): ViewAsInfo | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || typeof r.expires_at !== 'string') return null
  return {
    id: r.id,
    admin: typeof r.admin === 'string' ? r.admin : '',
    targetEmail: typeof r.target_email === 'string' ? r.target_email : '',
    expiresAt: r.expires_at,
  }
}

/** Whole minutes left, never below 0. */
export function minutesLeft(expiresAt: string, now: number = Date.now()): number {
  const end = Date.parse(expiresAt)
  if (Number.isNaN(end)) return 0
  return Math.max(0, Math.ceil((end - now) / 60000))
}

export function readSaved(raw: string | null): Saved | null {
  if (!raw) return null
  try {
    const s = JSON.parse(raw) as Partial<Saved>
    if (!s.refresh_token || !s.access_token || !s.id) return null
    return { access_token: s.access_token, refresh_token: s.refresh_token, admin_email: s.admin_email || '', id: s.id }
  } catch {
    return null
  }
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** True while this browser holds an admin sign in to go back to (cheap; no network). */
export function isViewAsBrowser(): boolean {
  return readSaved(storage()?.getItem(RETURN_KEY) ?? null) !== null
}

function goHome() {
  window.location.assign(import.meta.env.BASE_URL || '/')
}

/** Is this sign in session a View as session? Null when not, or when the SQL is not on yet. */
export async function getViewAs(): Promise<ViewAsInfo | null> {
  if (!isSupabaseConfigured()) return null
  const { data, error } = await getSupabaseClient().rpc('rr_view_as_active')
  if (error) return null
  return parseViewAs(data)
}

function friendly(message: string): string {
  if (/rr_view_as_request|function .* does not exist|schema cache/i.test(message)) {
    return 'View as needs the admin-view-as SQL in Supabase first.'
  }
  if (/Failed to send a request|FunctionsFetchError|404/i.test(message)) {
    return 'View as needs the admin-view-as Edge Function deployed (Actions, Deploy Edge Functions).'
  }
  return message
}

/** Admin: open the CRM as this team member. Reloads the page on success. */
export async function startViewAs(targetUserId: string, reason: string): Promise<void> {
  const sb = getSupabaseClient()
  const { data: current } = await sb.auth.getSession()
  const own = current.session
  if (!own) throw new Error('Sign in first')

  const { data: req, error: reqErr } = await sb.rpc('rr_view_as_request', { p_target: targetUserId, p_reason: reason })
  if (reqErr) throw new Error(friendly(reqErr.message))
  const request = req as { id?: string; claim?: string } | null
  if (!request?.id || !request.claim) throw new Error('Could not start View as')

  const { data: issued, error: fnErr } = await sb.functions.invoke('admin-view-as', { body: { id: request.id } })
  if (fnErr) {
    let detail = fnErr.message
    try {
      const body = await (fnErr as { context?: Response }).context?.json()
      if (body?.error) detail = String(body.error)
    } catch {
      /* keep the plain message */
    }
    throw new Error(friendly(detail))
  }
  const tokenHash = (issued as { token_hash?: string } | null)?.token_hash
  if (!tokenHash) throw new Error('Could not start View as')

  const saved: Saved = {
    access_token: own.access_token,
    refresh_token: own.refresh_token,
    admin_email: own.user.email || '',
    id: request.id,
  }
  storage()?.setItem(RETURN_KEY, JSON.stringify(saved))

  const { error: otpErr } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
  if (otpErr) {
    await restoreAdmin(saved)
    throw new Error(otpErr.message)
  }
  const { error: claimErr } = await sb.rpc('rr_view_as_claim', { p_id: request.id, p_claim: request.claim })
  if (claimErr) {
    await restoreAdmin(saved, true)
    throw new Error(claimErr.message)
  }
  goHome()
}

/**
 * Back to the admin's own sign in. endCurrent first ends the sign in this
 * browser holds now (the View as one), for this browser only.
 */
async function restoreAdmin(saved: Saved | null, endCurrent = false): Promise<boolean> {
  const sb = getSupabaseClient()
  storage()?.removeItem(RETURN_KEY)
  if (endCurrent) {
    try {
      await sb.auth.signOut({ scope: 'local' })
    } catch {
      /* already ended on the server */
    }
  }
  if (saved) {
    const { error } = await sb.auth.setSession({ access_token: saved.access_token, refresh_token: saved.refresh_token })
    if (!error) return true
  }
  // Only this browser: a global sign out would sign the member out on their own devices too.
  await sb.auth.signOut({ scope: 'local' })
  return false
}

/** Stop viewing: end the View as session and go back to the admin's own sign in. */
export async function stopViewAs(): Promise<void> {
  const sb = getSupabaseClient()
  const saved = readSaved(storage()?.getItem(RETURN_KEY) ?? null)
  try {
    await sb.rpc('rr_view_as_end', { p_id: null })
  } catch {
    /* the session is deleted on expiry anyway */
  }
  await restoreAdmin(saved, true)
  goHome()
}

/**
 * For the two step gate: the View as session when this is one. When the
 * browser still holds an admin sign in but View as has ended (time up, or
 * stopped in another tab), go back to the admin, or forget a stale copy.
 */
export async function settleViewAs(currentEmail: string): Promise<ViewAsInfo | null> {
  const saved = readSaved(storage()?.getItem(RETURN_KEY) ?? null)
  if (!saved) return null
  const info = await getViewAs()
  if (info) return info
  if (saved.admin_email && currentEmail.toLowerCase() === saved.admin_email.toLowerCase()) {
    storage()?.removeItem(RETURN_KEY)
    return null
  }
  await stopViewAs()
  return null
}

/** For Sign out: true when it should mean Stop (this is a live View as session). */
export async function signOutMeansStop(): Promise<boolean> {
  if (!isViewAsBrowser()) return false
  if (await getViewAs()) return true
  storage()?.removeItem(RETURN_KEY)
  return false
}

export type ViewAsHistoryRow = {
  id: string
  admin_email: string
  reason: string
  requested_at: string
  claimed_at: string | null
  ended_at: string | null
  end_reason: string
}

/** Admins: recent View as sessions for one team member. Empty when the SQL is not on yet. */
export async function listViewAsHistory(targetEmail: string, limit = 5): Promise<ViewAsHistoryRow[]> {
  if (!isSupabaseConfigured()) return []
  const { data, error } = await getSupabaseClient()
    .from('view_as_sessions')
    .select('id, admin_email, reason, requested_at, claimed_at, ended_at, end_reason')
    .eq('target_email', targetEmail.toLowerCase())
    .order('requested_at', { ascending: false })
    .limit(limit)
  if (error) return []
  return (data || []) as ViewAsHistoryRow[]
}
