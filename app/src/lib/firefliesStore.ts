import { format, parseISO } from 'date-fns'
import { db } from './db'
import { errorCode } from './errors'
import { meetingActivityBody, type FirefliesMeeting } from './fireflies'
import { getSupabaseClient, isSupabaseConfigured } from './supabaseConfig'

/** Reads a meeting from Fireflies through the fireflies-fetch function. */
export async function fetchFirefliesMeeting(accountId: string, meeting: string): Promise<FirefliesMeeting> {
  if (!isSupabaseConfigured()) throw new Error('Fireflies only works when RR Central is connected to the cloud.')
  const { data, error } = await getSupabaseClient().functions.invoke('fireflies-fetch', { body: { account_id: accountId, meeting } })
  if (error) {
    let message = 'Fireflies could not be reached. Try again later.'
    try {
      const b = await (error as { context?: Response }).context?.json()
      if (b?.error) message = String(b.error)
    } catch {
      // keep the plain message
    }
    throw new Error(message)
  }
  return (data as { meeting: FirefliesMeeting }).meeting
}

export function meetingWhen(m: Pick<FirefliesMeeting, 'date'>): string {
  return m.date ? format(parseISO(m.date), 'd MMM yyyy, HH:mm') : ''
}

/** Keeps the meeting as a Meeting on the timeline. The same call cannot be added twice. */
export async function saveMeetingActivity(
  accountId: string,
  m: FirefliesMeeting,
  author: { appUserId: string | null; email: string },
): Promise<void> {
  const { error } = await db.from('account_activities').insert({
    id: crypto.randomUUID(),
    account_id: accountId,
    user_id: author.appUserId,
    user_email: author.email,
    kind: 'meeting',
    body: meetingActivityBody(m, meetingWhen(m)),
    created_at: new Date().toISOString(),
    external_source: 'fireflies',
    external_id: m.id,
  })
  if (error) {
    if (errorCode(error) === '23505') throw new Error('This meeting is already on the timeline.')
    throw error
  }
}
