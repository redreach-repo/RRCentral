/**
 * Microsoft 365 Phase A client (Mail.Send + Calendars.ReadWrite).
 * Tokens stay in the m365-mail-calendar Edge Function.
 */

import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'
import type {
  CalendarEvent,
  CalendarInfo,
  FollowUpEventInput,
  ListEventsOpts,
  ProviderSettings,
  SendMailOpts,
  TeamMeetingInput,
} from './mailCalendar/types'

export type M365Status = {
  configured: boolean
  connected: boolean
  account_email: string
  redirect_uri: string
  scopes: string
}

export const M365_OFF: M365Status = {
  configured: false,
  connected: false,
  account_email: '',
  redirect_uri: '',
  scopes: '',
}

function setting(settings: ProviderSettings | undefined, key: string): string {
  return String(settings?.[key] ?? '').trim()
}

export function isM365Connected(settings?: ProviderSettings): boolean {
  return setting(settings, 'm365Connected').toLowerCase() === 'yes'
}

export function isM365MailEnabled(settings?: ProviderSettings): boolean {
  return isM365Connected(settings) && setting(settings, 'm365MailEnabled').toLowerCase() !== 'no'
}

export function isM365CalendarEnabled(settings?: ProviderSettings): boolean {
  return isM365Connected(settings) && setting(settings, 'm365CalendarEnabled').toLowerCase() !== 'no'
}

export function m365MailWebUrl(): string {
  return 'https://outlook.office.com/mail/'
}

export function m365CalendarWebUrl(): string {
  return 'https://outlook.office.com/calendar/'
}

async function callM365<T>(body: Record<string, unknown>): Promise<T> {
  if (!isSupabaseConfigured()) {
    throw new Error('Microsoft 365 needs RR Central connected to Supabase')
  }
  const { data, error } = await getSupabaseClient().functions.invoke('m365-mail-calendar', { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const detail = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null
    throw new Error((detail as { error?: string } | null)?.error || error.message || 'Microsoft 365 did not answer')
  }
  const res = data as T & { error?: string }
  if (res?.error) throw new Error(res.error)
  return res
}

export async function getM365Status(): Promise<M365Status> {
  if (!isSupabaseConfigured()) return M365_OFF
  return callM365<M365Status>({ action: 'status' })
}

export async function startM365Connect(returnTo = window.location.href): Promise<void> {
  const res = await callM365<{ url: string }>({ action: 'connect', return_to: returnTo })
  if (!res.url) throw new Error('Microsoft 365 connect did not return a URL')
  window.location.assign(res.url)
}

export async function disconnectM365(): Promise<void> {
  await callM365<{ ok: boolean }>({ action: 'disconnect' })
}

export async function sendM365Mail(settings: ProviderSettings, opts: SendMailOpts): Promise<void> {
  if (!isM365MailEnabled(settings)) {
    throw new Error('Microsoft 365 send is disabled — connect M365 in Settings')
  }
  await callM365({
    action: 'sendMail',
    to: opts.to,
    subject: opts.subject,
    body: opts.body,
    fromAddress: opts.fromAddress,
  })
}

export async function listM365Inbox(): Promise<never> {
  throw new Error('Microsoft 365 inbox is Phase B (Mail.Read). Use Zoho/Gmail send-only or wait for Phase B.')
}

export async function listM365Sent(): Promise<never> {
  throw new Error('Microsoft 365 Sent is Phase B (Mail.Read). Use Zoho/Gmail send-only or wait for Phase B.')
}

export async function listM365Calendars(settings: ProviderSettings): Promise<CalendarInfo[]> {
  if (!isM365CalendarEnabled(settings)) throw new Error('Microsoft 365 Calendar is disabled in Settings')
  const res = await callM365<{ calendars: CalendarInfo[] }>({ action: 'listCalendars' })
  return res.calendars || []
}

export async function listM365CalendarEvents(
  settings: ProviderSettings,
  opts: ListEventsOpts,
): Promise<CalendarEvent[]> {
  if (!isM365CalendarEnabled(settings)) throw new Error('Microsoft 365 Calendar is disabled in Settings')
  const res = await callM365<{ events: CalendarEvent[] }>({
    action: 'listEvents',
    start: opts.start.toISOString(),
    end: opts.end.toISOString(),
  })
  return res.events || []
}

export async function createM365TeamMeeting(
  settings: ProviderSettings,
  input: TeamMeetingInput,
): Promise<string> {
  if (!isM365CalendarEnabled(settings)) throw new Error('Microsoft 365 Calendar is disabled in Settings')
  const res = await callM365<{ eventId: string }>({ action: 'createTeamMeeting', ...input })
  return res.eventId || ''
}

export async function syncFollowUpToM365Calendar(
  settings: ProviderSettings,
  input: FollowUpEventInput,
): Promise<string> {
  if (!isM365CalendarEnabled(settings)) return input.existingEventId || ''
  const res = await callM365<{ eventId: string }>({ action: 'syncFollowUp', ...input })
  return res.eventId || input.existingEventId || ''
}

export async function deleteM365CalendarEvent(
  settings: ProviderSettings,
  eventId: string,
): Promise<void> {
  if (!isM365CalendarEnabled(settings) || !eventId) return
  await callM365({ action: 'deleteEvent', eventId })
}
