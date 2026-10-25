/**
 * Training and demo tracker (Wave 5, PR X): each demo, training, workshop or
 * review with a CTRM Next account, with the topics covered and left (from
 * the list in Settings), the recording link and when the follow up is due.
 * The Sessions card shows what is left to cover; My Day lists follow ups due.
 */
import type { CtrmSession, CtrmSessionKind } from './types'

export const SESSION_KINDS: { value: CtrmSessionKind; label: string }[] = [
  { value: 'demo', label: 'Demo' },
  { value: 'training', label: 'Training' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'review', label: 'Review' },
]
export const sessionKindLabel = (k: string) => SESSION_KINDS.find((o) => o.value === k)?.label ?? k

/** app_settings key for the topics list (one per line). */
export const SESSION_TOPICS_SETTING = 'ctrmSessionTopics'
export const DEFAULT_SESSION_TOPICS = [
  'Platform overview',
  'Trade capture',
  'Physical operations and scheduling',
  'Inventory',
  'Risk and exposure',
  'Invoicing and settlement',
  'Credit',
  'Reporting',
  'Users and permissions',
]

export type SessionDraft = Pick<
  CtrmSession,
  'kind' | 'session_date' | 'attendees' | 'topics_covered' | 'topics_left' | 'recording_url' | 'follow_up_due' | 'notes'
>

/** Why a session cannot be saved yet, or null. */
export function sessionProblem(d: SessionDraft): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.session_date)) return 'Pick the date of the session'
  const url = d.recording_url.trim()
  if (url && !/^https?:\/\/\S+$/i.test(url)) return 'The recording link must start with https://'
  if (d.follow_up_due && d.follow_up_due < d.session_date) return 'The follow up cannot be due before the session'
  const both = d.topics_covered.filter((t) => d.topics_left.includes(t))
  if (both.length) return `"${both[0]}" cannot be both covered and left`
  return null
}

type Mentions = Pick<CtrmSession, 'session_date' | 'created_at' | 'topics_covered' | 'topics_left'>

/**
 * What is still left to cover across all sessions: a topic counts as left
 * when the latest session that mentions it marked it left.
 */
export function leftToCover(sessions: Mentions[]): string[] {
  const state = new Map<string, 'left' | 'covered'>()
  const ordered = [...sessions].sort((a, b) => a.session_date.localeCompare(b.session_date) || a.created_at.localeCompare(b.created_at))
  for (const s of ordered) {
    for (const t of s.topics_left) state.set(t, 'left')
    for (const t of s.topics_covered) state.set(t, 'covered')
  }
  return [...state.entries()].filter(([, v]) => v === 'left').map(([t]) => t)
}

/** Every topic covered in any session. */
export function coveredTopics(sessions: Mentions[]): string[] {
  return [...new Set(sessions.flatMap((s) => s.topics_covered))]
}

/** Topics from the Settings list nobody has covered or planned yet. */
export function notStarted(sessions: Mentions[], topics: string[]): string[] {
  const seen = new Set(sessions.flatMap((s) => [...s.topics_covered, ...s.topics_left]))
  return topics.filter((t) => !seen.has(t))
}

/** Sessions whose follow up is due today or earlier and not done, soonest first. */
export function followUpsDue<T extends Pick<CtrmSession, 'follow_up_due' | 'follow_up_done'>>(sessions: T[], today: string): T[] {
  return sessions
    .filter((s) => !s.follow_up_done && s.follow_up_due && s.follow_up_due <= today)
    .sort((a, b) => String(a.follow_up_due).localeCompare(String(b.follow_up_due)))
}

/** The timeline line when a session is logged. */
export function sessionTimelineText(d: SessionDraft): string {
  const covered = d.topics_covered.length ? ` Covered: ${d.topics_covered.join(', ')}.` : ''
  const left = d.topics_left.length ? ` Left: ${d.topics_left.join(', ')}.` : ''
  return `${sessionKindLabel(d.kind)} on ${d.session_date}.${covered}${left}`
}
