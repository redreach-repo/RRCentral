/**
 * Zoho Calendar + Mail client.
 * Browser calls go through the Supabase `zoho-proxy` edge function when available
 * (Safari/Chrome block direct Zoho OAuth with CORS → 405).
 */

import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'

export type ZohoSettings = Record<string, string>

const TOKEN_CACHE_KEY = 'rrcentral_zoho_access_token'

type TokenCache = {
  accessToken: string
  expiresAt: number
  accountsDomain: string
}

function setting(settings: ZohoSettings, key: string, fallback = ''): string {
  return String(settings[key] ?? fallback).trim()
}

export function isZohoConfigured(settings: ZohoSettings): boolean {
  return Boolean(
    setting(settings, 'zohoClientId') &&
      setting(settings, 'zohoClientSecret') &&
      setting(settings, 'zohoRefreshToken'),
  )
}

export function isZohoCalendarEnabled(settings: ZohoSettings): boolean {
  return isZohoConfigured(settings) && setting(settings, 'zohoCalendarEnabled', 'no').toLowerCase() === 'yes'
}

export function isZohoMailEnabled(settings: ZohoSettings): boolean {
  return isZohoConfigured(settings) && setting(settings, 'zohoMailEnabled', 'no').toLowerCase() === 'yes'
}

function accountsDomain(settings: ZohoSettings): string {
  return setting(settings, 'zohoAccountsDomain', 'https://accounts.zoho.com').replace(/\/$/, '')
}

function calendarDomain(settings: ZohoSettings): string {
  // Prefer explicit calendar domain; fall back from accounts region
  const explicit = setting(settings, 'zohoCalendarDomain')
  if (explicit) return explicit.replace(/\/$/, '')
  const accounts = accountsDomain(settings)
  if (accounts.includes('zoho.eu')) return 'https://calendar.zoho.eu'
  if (accounts.includes('zoho.in')) return 'https://calendar.zoho.in'
  if (accounts.includes('zoho.com.au')) return 'https://calendar.zoho.com.au'
  return 'https://calendar.zoho.com'
}

function mailDomain(settings: ZohoSettings): string {
  const explicit = setting(settings, 'zohoMailDomain')
  if (explicit) return explicit.replace(/\/$/, '')
  const accounts = accountsDomain(settings)
  if (accounts.includes('zoho.eu')) return 'https://mail.zoho.eu'
  if (accounts.includes('zoho.in')) return 'https://mail.zoho.in'
  if (accounts.includes('zoho.com.au')) return 'https://mail.zoho.com.au'
  return 'https://mail.zoho.com'
}

function readTokenCache(settings: ZohoSettings): TokenCache | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as TokenCache
    if (parsed.accountsDomain !== accountsDomain(settings)) return null
    if (Date.now() >= parsed.expiresAt - 30_000) return null
    return parsed
  } catch {
    return null
  }
}

function writeTokenCache(cache: TokenCache) {
  sessionStorage.setItem(TOKEN_CACHE_KEY, JSON.stringify(cache))
}

function corsHint(status: number): string {
  if (status === 405 || status === 0) {
    return (
      'Browser blocked Zoho (CORS). Connect Supabase cloud, deploy the `zoho-proxy` edge function, ' +
      'then try again. See Settings → Zoho for deploy steps.'
    )
  }
  return `Zoho token refresh failed (${status})`
}

/** Preferred slug, plus the accidental Dashboard default name if already deployed. */
const ZOHO_PROXY_SLUGS = ['zoho-proxy', 'bright-function'] as const

function isMissingFunctionError(msg: string): boolean {
  return /404|not found|Failed to send|Function not found/i.test(msg)
}

async function invokeZohoProxy(body: Record<string, unknown>): Promise<{ data: unknown; error: Error | null }> {
  const supabase = getSupabaseClient()
  let lastError: Error | null = null
  for (const slug of ZOHO_PROXY_SLUGS) {
    const { data, error } = await supabase.functions.invoke(slug, { body })
    if (!error) return { data, error: null }
    const err = error instanceof Error ? error : new Error(error.message || String(error))
    lastError = err
    if (!isMissingFunctionError(err.message)) return { data: null, error: err }
  }
  return {
    data: null,
    error: new Error(
      lastError?.message ||
        'Zoho proxy not deployed. In Supabase → Edge Functions, deploy `zoho-proxy` (file index.ts), then retry.',
    ),
  }
}

async function refreshTokenViaProxy(settings: ZohoSettings): Promise<{
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
  status: number
}> {
  const { data, error } = await invokeZohoProxy({
    action: 'token',
    accountsDomain: accountsDomain(settings),
    clientId: setting(settings, 'zohoClientId'),
    clientSecret: setting(settings, 'zohoClientSecret'),
    refreshToken: setting(settings, 'zohoRefreshToken'),
  })
  if (error) {
    if (isMissingFunctionError(error.message)) {
      throw new Error(
        'Zoho proxy not deployed. In Supabase → Edge Functions, deploy `zoho-proxy` from this repo (supabase/functions/zoho-proxy), then retry.',
      )
    }
    throw error
  }
  const payload = (data || {}) as {
    access_token?: string
    expires_in?: number
    error?: string
    error_description?: string
    _httpStatus?: number
  }
  return { ...payload, status: payload.access_token ? 200 : Number(payload._httpStatus) || 400 }
}

async function refreshTokenDirect(settings: ZohoSettings): Promise<{
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
  status: number
}> {
  const body = new URLSearchParams({
    refresh_token: setting(settings, 'zohoRefreshToken'),
    client_id: setting(settings, 'zohoClientId'),
    client_secret: setting(settings, 'zohoClientSecret'),
    grant_type: 'refresh_token',
  })
  const res = await fetch(`${accountsDomain(settings)}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string
    expires_in?: number
    error?: string
    error_description?: string
  }
  return { ...data, status: res.status }
}

export async function getZohoAccessToken(settings: ZohoSettings): Promise<string> {
  if (!isZohoConfigured(settings)) {
    throw new Error('Zoho is not configured — add Client ID, Secret, and Refresh Token in Settings')
  }

  const cached = readTokenCache(settings)
  if (cached?.accessToken) return cached.accessToken

  let data: {
    access_token?: string
    expires_in?: number
    error?: string
    error_description?: string
    status: number
  }

  if (isSupabaseConfigured()) {
    try {
      data = await refreshTokenViaProxy(settings)
    } catch (proxyErr) {
      // Fall back to direct call (may work in some browsers / extensions)
      try {
        data = await refreshTokenDirect(settings)
        if (!data.access_token && (data.status === 405 || data.status === 0)) {
          throw proxyErr
        }
      } catch {
        throw proxyErr instanceof Error ? proxyErr : new Error(String(proxyErr))
      }
    }
  } else {
    try {
      data = await refreshTokenDirect(settings)
    } catch {
      throw new Error(
        'Cannot reach Zoho from this browser. Connect Supabase in Settings (cloud mode) and deploy the zoho-proxy edge function.',
      )
    }
  }

  if (!data.access_token) {
    throw new Error(
      data.error_description || data.error || corsHint(data.status),
    )
  }

  writeTokenCache({
    accessToken: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
    accountsDomain: accountsDomain(settings),
  })

  return data.access_token
}

async function zohoFetch(
  settings: ZohoSettings,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getZohoAccessToken(settings)
  const headers = new Headers(init.headers || {})
  headers.set('Authorization', `Zoho-oauthtoken ${token}`)
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json')
  }

  if (isSupabaseConfigured()) {
    try {
      const headerObj: Record<string, string> = {}
      headers.forEach((v, k) => {
        headerObj[k] = v
      })
      const { data, error } = await invokeZohoProxy({
        action: 'api',
        url,
        method: init.method || 'GET',
        headers: headerObj,
        body: typeof init.body === 'string' ? init.body : init.body ? String(init.body) : null,
      })
      if (error) throw error
      const wrapped = data as { ok?: boolean; status?: number; body?: unknown }
      const status = Number(wrapped?.status) || 200
      const payload = wrapped?.body !== undefined ? wrapped.body : data
      const text = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {})
      return new Response(text, {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch {
      // fall through to direct
    }
  }

  return fetch(url, { ...init, headers })
}

export async function testZohoConnection(settings: ZohoSettings): Promise<string> {
  await getZohoAccessToken(settings)
  const parts: string[] = ['Token OK']

  if (isZohoCalendarEnabled(settings) || setting(settings, 'zohoCalendarEnabled') !== 'no') {
    try {
      const uid = await resolveCalendarUid(settings)
      parts.push(`Calendar: ${uid.slice(0, 12)}…`)
    } catch (e) {
      parts.push(`Calendar: ${e instanceof Error ? e.message : 'failed'}`)
    }
  }

  if (isZohoMailEnabled(settings) || setting(settings, 'zohoMailEnabled') === 'yes') {
    try {
      const account = await resolveMailAccount(settings)
      parts.push(`Mail: ${account.accountId}`)
      try {
        const folderId = await resolveInboxFolderId(settings)
        const inbox = await listZohoInboxMessages(settings, { limit: 1, folderId })
        parts.push(`Inbox OK (${inbox.length ? 'readable' : 'empty'})`)
      } catch (inboxErr) {
        parts.push(
          `Inbox: ${inboxErr instanceof Error ? inboxErr.message : 'read failed — add ZohoMail.messages.READ scope'}`,
        )
      }
    } catch (e) {
      parts.push(`Mail: ${e instanceof Error ? e.message : 'failed'}`)
    }
  }

  return parts.join(' · ')
}

export async function resolveCalendarUid(settings: ZohoSettings): Promise<string> {
  const configured = setting(settings, 'zohoCalendarUid')
  if (configured) return configured

  const res = await zohoFetch(settings, `${calendarDomain(settings)}/api/v1/calendars`)
  const data = (await res.json().catch(() => ({}))) as {
    calendars?: Array<{ uid?: string; isdefault?: boolean | string; name?: string }>
    status?: { code?: number; description?: string }
    message?: string
  }
  if (!res.ok) {
    throw new Error(data.message || data.status?.description || `List calendars failed (${res.status})`)
  }
  const cals = data.calendars || []
  const def =
    cals.find((c) => c.isdefault === true || c.isdefault === 'true') || cals[0]
  if (!def?.uid) throw new Error('No Zoho calendar found for this account')
  return def.uid
}

function eventDateTime(dateYmd: string, hour = 10, durationMinutes = 30) {
  const start = `${dateYmd.replace(/-/g, '')}T${String(hour).padStart(2, '0')}0000`
  const endHour = hour
  const endMin = durationMinutes
  const end = `${dateYmd.replace(/-/g, '')}T${String(endHour).padStart(2, '0')}${String(endMin).padStart(2, '0')}00`
  return {
    timezone: 'Asia/Dubai',
    start,
    end,
  }
}

export type FollowUpEventInput = {
  company: string
  nextAction?: string
  owner?: string
  contactName?: string
  contactEmail?: string
  followUpDate: string // yyyy-MM-dd
  existingEventId?: string
}

function buildEventPayload(input: FollowUpEventInput) {
  const title = `Follow-up: ${input.company}`
  const description = [
    input.nextAction ? `Action: ${input.nextAction}` : '',
    input.owner ? `Owner: ${input.owner}` : '',
    input.contactName ? `Contact: ${input.contactName}` : '',
    input.contactEmail ? `Email: ${input.contactEmail}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  const payload: Record<string, unknown> = {
    title,
    description,
    dateandtime: eventDateTime(input.followUpDate),
    isallday: false,
    reminders: [{ action: 'popup', minutes: -60 }],
  }
  if (input.contactEmail) {
    payload.attendees = [{ email: input.contactEmail, status: 'NEEDS-ACTION' }]
  }
  return payload
}

function extractEventUid(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const d = data as Record<string, unknown>
  if (typeof d.uid === 'string') return d.uid
  if (Array.isArray(d.events) && d.events[0] && typeof d.events[0] === 'object') {
    const ev = d.events[0] as Record<string, unknown>
    if (typeof ev.uid === 'string') return ev.uid
  }
  if (d.event && typeof d.event === 'object') {
    const ev = d.event as Record<string, unknown>
    if (typeof ev.uid === 'string') return ev.uid
  }
  return ''
}

/** Create or update a Zoho Calendar event for a CRM follow-up. Returns event uid. */
export async function syncFollowUpToZohoCalendar(
  settings: ZohoSettings,
  input: FollowUpEventInput,
): Promise<string> {
  if (!isZohoCalendarEnabled(settings)) return input.existingEventId || ''

  const calUid = await resolveCalendarUid(settings)
  const eventdata = encodeURIComponent(JSON.stringify(buildEventPayload(input)))
  const base = `${calendarDomain(settings)}/api/v1/calendars/${encodeURIComponent(calUid)}/events`

  if (input.existingEventId) {
    const res = await zohoFetch(
      settings,
      `${base}/${encodeURIComponent(input.existingEventId)}?eventdata=${eventdata}`,
      { method: 'PUT' },
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      // Event may have been deleted — try create
      if (res.status === 404 || res.status === 400) {
        return createCalendarEvent(settings, calUid, eventdata)
      }
      throw new Error(
        (data as { message?: string }).message || `Update calendar event failed (${res.status})`,
      )
    }
    return extractEventUid(data) || input.existingEventId
  }

  return createCalendarEvent(settings, calUid, eventdata)
}

async function createCalendarEvent(
  settings: ZohoSettings,
  calUid: string,
  eventdata: string,
): Promise<string> {
  const res = await zohoFetch(
    settings,
    `${calendarDomain(settings)}/api/v1/calendars/${encodeURIComponent(calUid)}/events?eventdata=${eventdata}`,
    { method: 'POST' },
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(
      (data as { message?: string }).message || `Create calendar event failed (${res.status})`,
    )
  }
  const uid = extractEventUid(data)
  if (!uid) throw new Error('Zoho created event but returned no uid')
  return uid
}

export async function deleteZohoCalendarEvent(
  settings: ZohoSettings,
  eventId: string,
): Promise<void> {
  if (!isZohoCalendarEnabled(settings) || !eventId) return
  const calUid = await resolveCalendarUid(settings)
  const res = await zohoFetch(
    settings,
    `${calendarDomain(settings)}/api/v1/calendars/${encodeURIComponent(calUid)}/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE' },
  )
  if (!res.ok && res.status !== 404) {
    const data = await res.json().catch(() => ({}))
    throw new Error(
      (data as { message?: string }).message || `Delete calendar event failed (${res.status})`,
    )
  }
}

export type MailAccount = {
  accountId: string
  fromAddress: string
}

export async function resolveMailAccount(settings: ZohoSettings): Promise<MailAccount> {
  const configuredId = setting(settings, 'zohoMailAccountId')
  const fromFallback = setting(settings, 'email') || setting(settings, 'zohoMailFrom')

  const res = await zohoFetch(settings, `${mailDomain(settings)}/api/accounts`)
  const data = (await res.json().catch(() => ({}))) as {
    data?: Array<{
      accountId?: string | number
      primaryEmailAddress?: string
      sendMailDetails?: Array<{ sendMailId?: string; fromAddress?: string }>
      mailboxAddress?: string
    }>
    status?: { code?: number; description?: string }
  }
  if (!res.ok) {
    throw new Error(data.status?.description || `List mail accounts failed (${res.status})`)
  }

  const accounts = data.data || []
  const match = configuredId
    ? accounts.find((a) => String(a.accountId) === configuredId)
    : accounts[0]
  if (!match?.accountId) throw new Error('No Zoho Mail account found')

  const from =
    match.sendMailDetails?.[0]?.fromAddress ||
    match.primaryEmailAddress ||
    match.mailboxAddress ||
    fromFallback
  if (!from) throw new Error('Could not resolve Zoho Mail from-address')

  return { accountId: String(match.accountId), fromAddress: from }
}

export async function sendZohoMail(
  settings: ZohoSettings,
  opts: { to: string; subject: string; body: string; fromAddress?: string },
): Promise<void> {
  if (!isZohoMailEnabled(settings)) {
    throw new Error('Zoho Mail is disabled in Settings')
  }
  const account = await resolveMailAccount(settings)
  const res = await zohoFetch(
    settings,
    `${mailDomain(settings)}/api/accounts/${encodeURIComponent(account.accountId)}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        fromAddress: opts.fromAddress || account.fromAddress,
        toAddress: opts.to,
        subject: opts.subject,
        content: opts.body,
        mailFormat: 'plaintext',
      }),
    },
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(
      (data as { status?: { description?: string } }).status?.description ||
        `Send mail failed (${res.status})`,
    )
  }
}

export type ZohoMailFolder = {
  folderId: string
  folderName: string
  folderType?: string
}

export type ZohoInboxMessage = {
  messageId: string
  subject: string
  fromAddress: string
  sender: string
  summary: string
  receivedTime: number
  status: 'read' | 'unread'
  hasAttachment: boolean
  folderId: string
  toAddress?: string
}

export async function listZohoMailFolders(settings: ZohoSettings): Promise<ZohoMailFolder[]> {
  if (!isZohoMailEnabled(settings)) {
    throw new Error('Zoho Mail is disabled in Settings — set Mail to yes')
  }
  const account = await resolveMailAccount(settings)
  const res = await zohoFetch(
    settings,
    `${mailDomain(settings)}/api/accounts/${encodeURIComponent(account.accountId)}/folders`,
  )
  const data = (await res.json().catch(() => ({}))) as {
    data?: Array<{
      folderId?: string | number
      folderName?: string
      folderType?: string
    }>
    status?: { description?: string }
  }
  if (!res.ok) {
    throw new Error(data.status?.description || `List folders failed (${res.status})`)
  }
  return (data.data || [])
    .filter((f) => f.folderId != null)
    .map((f) => ({
      folderId: String(f.folderId),
      folderName: f.folderName || '',
      folderType: f.folderType,
    }))
}

export async function resolveInboxFolderId(settings: ZohoSettings): Promise<string> {
  const folders = await listZohoMailFolders(settings)
  const inbox =
    folders.find((f) => /inbox/i.test(f.folderName)) ||
    folders.find((f) => String(f.folderType || '').toLowerCase() === 'inbox') ||
    folders[0]
  if (!inbox?.folderId) throw new Error('No Zoho Mail inbox folder found')
  return inbox.folderId
}

function normalizeZohoMessage(raw: Record<string, unknown>): ZohoInboxMessage | null {
  const messageId = String(raw.messageId || '')
  if (!messageId) return null
  const received = Number(raw.receivedTime || raw.sentDateInGMT || 0)
  const statusRaw = String(raw.status ?? '1')
  // Zoho: status "0" often unread, "1" read (varies by API version)
  const unread = statusRaw === '0' || String(raw.status2 || '') === '0'
  return {
    messageId,
    subject: String(raw.subject || '(no subject)'),
    fromAddress: String(raw.fromAddress || ''),
    sender: String(raw.sender || raw.fromAddress || ''),
    summary: String(raw.summary || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    receivedTime: Number.isFinite(received) ? received : 0,
    status: unread ? 'unread' : 'read',
    hasAttachment: String(raw.hasAttachment || '0') !== '0' && String(raw.hasAttachment) !== 'false',
    folderId: String(raw.folderId || ''),
    toAddress: raw.toAddress ? String(raw.toAddress) : undefined,
  }
}

/** Recent inbox messages from Zoho Mail (requires ZohoMail.messages.READ scope). */
export async function listZohoInboxMessages(
  settings: ZohoSettings,
  opts?: { limit?: number; status?: 'all' | 'read' | 'unread'; folderId?: string },
): Promise<ZohoInboxMessage[]> {
  if (!isZohoMailEnabled(settings)) {
    throw new Error('Zoho Mail is disabled in Settings — set Mail to yes')
  }
  const account = await resolveMailAccount(settings)
  const folderId = opts?.folderId || (await resolveInboxFolderId(settings))
  const limit = Math.min(Math.max(opts?.limit || 25, 1), 50)
  const params = new URLSearchParams({
    folderId,
    start: '1',
    limit: String(limit),
    status: opts?.status || 'all',
    includeto: 'true',
    sortBy: 'date',
    sortorder: 'false',
  })
  const res = await zohoFetch(
    settings,
    `${mailDomain(settings)}/api/accounts/${encodeURIComponent(account.accountId)}/messages/view?${params}`,
  )
  const data = (await res.json().catch(() => ({}))) as {
    data?: Array<Record<string, unknown>>
    status?: { description?: string }
  }
  if (!res.ok) {
    const desc = data.status?.description || `List inbox failed (${res.status})`
    if (res.status === 0 || /Failed to fetch|NetworkError|CORS/i.test(desc)) {
      throw new Error(
        'Could not reach Zoho Mail from this browser (network/CORS). Confirm Mail is yes, scopes include ZohoMail.messages.READ, and try again.',
      )
    }
    throw new Error(desc)
  }
  return (data.data || [])
    .map((row) => normalizeZohoMessage(row))
    .filter((m): m is ZohoInboxMessage => Boolean(m))
}

export function zohoMailWebUrl(settings: ZohoSettings): string {
  return `${mailDomain(settings)}/`
}

export function openMailto(to: string, subject: string, body: string) {
  const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  window.open(url, '_blank')
}
