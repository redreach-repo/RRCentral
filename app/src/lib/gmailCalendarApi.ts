/**
 * Gmail + Google Calendar Phase A client.
 * Tokens stay in the gmail-calendar Edge Function; the browser never sees them.
 * Scopes: gmail.send + calendar.events only (see docs/COMPLIANCE_NOTES.md).
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
import { PRODUCT } from './product'

export type GmailStatus = {
  configured: boolean
  connected: boolean
  account_email: string
  redirect_uri: string
  scopes: string
}

export const GMAIL_OFF: GmailStatus = {
  configured: false,
  connected: false,
  account_email: '',
  redirect_uri: '',
  scopes: '',
}

function setting(settings: ProviderSettings | undefined, key: string): string {
  return String(settings?.[key] ?? '').trim()
}

export function isGmailConnected(settings?: ProviderSettings): boolean {
  return setting(settings, 'gmailConnected').toLowerCase() === 'yes'
}

export function isGmailMailEnabled(settings?: ProviderSettings): boolean {
  return isGmailConnected(settings) && setting(settings, 'gmailMailEnabled').toLowerCase() !== 'no'
}

export function isGmailCalendarEnabled(settings?: ProviderSettings): boolean {
  return isGmailConnected(settings) && setting(settings, 'gmailCalendarEnabled').toLowerCase() !== 'no'
}

export function gmailMailWebUrl(_settings?: ProviderSettings): string {
  return 'https://mail.google.com/'
}

export function gmailCalendarWebUrl(_settings?: ProviderSettings): string {
  return 'https://calendar.google.com/'
}

async function callGmail<T>(body: Record<string, unknown>): Promise<T> {
  if (!isSupabaseConfigured()) {
    throw new Error(`Gmail needs ${PRODUCT.name} connected to Supabase`)
  }
  const { data, error } = await getSupabaseClient().functions.invoke('gmail-calendar', { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const detail = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null
    throw new Error((detail as { error?: string } | null)?.error || error.message || 'Gmail did not answer')
  }
  const res = data as T & { error?: string }
  if (res?.error) throw new Error(res.error)
  return res
}

export async function getGmailStatus(): Promise<GmailStatus> {
  if (!isSupabaseConfigured()) return GMAIL_OFF
  return callGmail<GmailStatus>({ action: 'status' })
}

export async function startGmailConnect(returnTo = window.location.href): Promise<void> {
  const res = await callGmail<{ url: string }>({ action: 'connect', return_to: returnTo })
  if (!res.url) throw new Error('Gmail connect did not return a URL')
  window.location.assign(res.url)
}

export async function disconnectGmail(): Promise<void> {
  await callGmail<{ ok: boolean }>({ action: 'disconnect' })
}

export async function sendGmailMail(
  settings: ProviderSettings,
  opts: SendMailOpts,
): Promise<void> {
  if (!isGmailMailEnabled(settings)) {
    throw new Error('Gmail send is disabled — connect Gmail in Settings and set Mail to yes')
  }
  await callGmail({
    action: 'sendMail',
    to: opts.to,
    subject: opts.subject,
    body: opts.body,
    fromAddress: opts.fromAddress,
  })
}

/** Phase B — restricted scopes. */
export async function listGmailInbox(): Promise<never> {
  throw new Error(
    'Gmail inbox is Phase B (gmail.readonly is restricted). Use Zoho for inbox or wait for Phase B.',
  )
}

export async function listGmailSent(): Promise<never> {
  throw new Error(
    'Gmail Sent is Phase B (gmail.readonly is restricted). Use Zoho for Sent or wait for Phase B.',
  )
}

export async function listGmailCalendars(
  settings: ProviderSettings,
): Promise<CalendarInfo[]> {
  if (!isGmailCalendarEnabled(settings)) {
    throw new Error('Gmail Calendar is disabled in Settings')
  }
  const res = await callGmail<{ calendars: CalendarInfo[] }>({ action: 'listCalendars' })
  return res.calendars || []
}

export async function listGmailCalendarEvents(
  settings: ProviderSettings,
  opts: ListEventsOpts,
): Promise<CalendarEvent[]> {
  if (!isGmailCalendarEnabled(settings)) {
    throw new Error('Gmail Calendar is disabled in Settings')
  }
  const res = await callGmail<{ events: CalendarEvent[] }>({
    action: 'listEvents',
    start: opts.start.toISOString(),
    end: opts.end.toISOString(),
  })
  return res.events || []
}

export async function createGmailTeamMeeting(
  settings: ProviderSettings,
  input: TeamMeetingInput,
): Promise<string> {
  if (!isGmailCalendarEnabled(settings)) {
    throw new Error('Gmail Calendar is disabled in Settings')
  }
  const res = await callGmail<{ eventId: string }>({
    action: 'createTeamMeeting',
    ...input,
  })
  return res.eventId || ''
}

export async function syncFollowUpToGmailCalendar(
  settings: ProviderSettings,
  input: FollowUpEventInput,
): Promise<string> {
  if (!isGmailCalendarEnabled(settings)) return input.existingEventId || ''
  const res = await callGmail<{ eventId: string }>({
    action: 'syncFollowUp',
    ...input,
  })
  return res.eventId || input.existingEventId || ''
}

export async function deleteGmailCalendarEvent(
  settings: ProviderSettings,
  eventId: string,
): Promise<void> {
  if (!isGmailCalendarEnabled(settings) || !eventId) return
  await callGmail({ action: 'deleteEvent', eventId })
}
