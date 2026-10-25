/**
 * Fireflies calls on the account timeline (manual for now): paste a meeting's
 * link or ID, the fireflies-fetch Edge Function reads its summary and action
 * items with the Fireflies API key, and the app keeps them as a Meeting on the
 * account's timeline. For an AI CRM build client the notes then go through
 * AI help "Requirements from call notes". Shared by the app and the function
 * (bundled). Only pure code here.
 */

export const FIREFLIES_GRAPHQL = 'https://api.fireflies.ai/graphql'

export const TRANSCRIPT_QUERY = `query Transcript($id: String!) {
  transcript(id: $id) {
    id
    title
    date
    duration
    transcript_url
    participants
    summary { overview action_items }
  }
}`

/**
 * The meeting ID from what was pasted: a Fireflies link such as
 * https://app.fireflies.ai/view/Weekly-call::01HXYZ..., or the ID itself.
 */
export function parseFirefliesId(input: string): string | null {
  const raw = String(input || '').trim()
  if (!raw) return null
  const fromView = /::([A-Za-z0-9]{8,64})(?:[/?#]|$)/.exec(raw)
  if (fromView) return fromView[1]
  try {
    const u = new URL(raw)
    if (!/(^|\.)fireflies\.ai$/.test(u.hostname)) return null
    const q = u.searchParams.get('id')
    if (q && /^[A-Za-z0-9]{8,64}$/.test(q)) return q
    const last = u.pathname.split('/').filter(Boolean).pop() || ''
    return /^[A-Za-z0-9]{8,64}$/.test(last) ? last : null
  } catch {
    return /^[A-Za-z0-9]{8,64}$/.test(raw) ? raw : null
  }
}

export type FirefliesMeeting = {
  id: string
  title: string
  /** ISO date and time of the meeting. */
  date: string
  minutes: number
  url: string
  participants: string[]
  overview: string
  actionItems: string[]
}

/** Reads the Fireflies answer into what we keep. Null when the meeting was not found. */
export function readTranscript(data: unknown): FirefliesMeeting | null {
  const t = (data as { transcript?: Record<string, unknown> | null } | null)?.transcript
  if (!t || typeof t.id !== 'string') return null
  const s = (t.summary || {}) as { overview?: unknown; action_items?: unknown }
  const items = Array.isArray(s.action_items) ? s.action_items.map(String) : String(s.action_items || '').split('\n')
  const dateNum = Number(t.date)
  return {
    id: t.id,
    title: String(t.title || 'Fireflies meeting').slice(0, 300),
    date: Number.isFinite(dateNum) && dateNum > 0 ? new Date(dateNum).toISOString() : '',
    minutes: Math.round(Number(t.duration) || 0),
    url: typeof t.transcript_url === 'string' ? t.transcript_url : '',
    participants: Array.isArray(t.participants) ? t.participants.map(String).slice(0, 30) : [],
    overview: String(s.overview || '').trim().slice(0, 6000),
    // Fireflies groups action items under "**Name**" headings: keep the items only.
    actionItems: items
      .filter((l) => !/^\s*\*\*.*\*\*\s*$/.test(l))
      .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 50),
  }
}

/** The timeline entry: title, when, the summary and the action items. */
export function meetingActivityBody(m: FirefliesMeeting, whenLabel: string): string {
  return [
    `Fireflies: ${m.title}${whenLabel ? `, ${whenLabel}` : ''}${m.minutes ? ` (${m.minutes} min)` : ''}`,
    m.overview ? `Summary:\n${m.overview}` : '',
    m.actionItems.length ? `Action items:\n${m.actionItems.map((a) => `- ${a}`).join('\n')}` : '',
    m.url ? `Transcript: ${m.url}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 10000)
}

/** What AI help reads to find requirements: the summary and the action items. */
export function meetingNotesForAi(m: FirefliesMeeting): string {
  return [m.title, m.overview, m.actionItems.map((a) => `- ${a}`).join('\n')].filter(Boolean).join('\n\n')
}

/** Who may attach calls: the people who can add to a timeline. */
export function canAttachCalls(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'manager' || role === 'sales' || role === 'staff'
}
