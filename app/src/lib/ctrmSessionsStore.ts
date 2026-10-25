import { format } from 'date-fns'
import { db } from './db'
import { isMissingRelationError } from './errors'
import { logAccountEvent } from './accountsStore'
import { followUpsDue, sessionTimelineText, type SessionDraft } from './ctrmSessions'
import type { CtrmSession } from './types'

type Author = { appUserId: string | null; email: string }

const clean = (s: CtrmSession): CtrmSession => ({
  ...s,
  topics_covered: Array.isArray(s.topics_covered) ? s.topics_covered : [],
  topics_left: Array.isArray(s.topics_left) ? s.topics_left : [],
})

export async function listSessions(accountId?: string): Promise<{ rows: CtrmSession[]; missingTable: boolean }> {
  let q = db.from('ctrm_sessions').select('*')
  if (accountId) q = q.eq('account_id', accountId)
  const { data, error } = await q
  if (error) {
    if (isMissingRelationError(error)) return { rows: [], missingTable: true }
    throw error
  }
  const rows = ((data || []) as CtrmSession[]).map(clean)
  rows.sort((a, b) => b.session_date.localeCompare(a.session_date) || b.created_at.localeCompare(a.created_at))
  return { rows, missingTable: false }
}

export async function saveSession(accountId: string, draft: SessionDraft, existing: CtrmSession | null, author: Author): Promise<void> {
  const now = new Date().toISOString()
  const values = {
    kind: draft.kind,
    session_date: draft.session_date,
    attendees: draft.attendees.trim(),
    topics_covered: draft.topics_covered,
    topics_left: draft.topics_left,
    recording_url: draft.recording_url.trim(),
    follow_up_due: draft.follow_up_due || null,
    notes: draft.notes.trim(),
    updated_at: now,
  }
  const { error } = existing
    ? await db.from('ctrm_sessions').update(values).eq('id', existing.id)
    : await db
        .from('ctrm_sessions')
        .insert({ id: crypto.randomUUID(), account_id: accountId, follow_up_done: false, created_by: author.email, created_at: now, ...values })
  if (error) {
    if (isMissingRelationError(error)) throw new Error('Run the sessions SQL first.')
    throw error
  }
  if (!existing) await logAccountEvent(accountId, sessionTimelineText(draft), author)
}

export async function markFollowUpDone(session: CtrmSession, author: Author): Promise<void> {
  const { error } = await db.from('ctrm_sessions').update({ follow_up_done: true, updated_at: new Date().toISOString() }).eq('id', session.id)
  if (error) throw error
  await logAccountEvent(session.account_id, `Follow up after the ${session.kind} on ${session.session_date} done`, author)
}

/** Follow ups due today or earlier, with the account name, for My Day. */
export async function loadFollowUpsDue(today = format(new Date(), 'yyyy-MM-dd')): Promise<(CtrmSession & { accountName: string })[]> {
  const { rows } = await listSessions()
  const due = followUpsDue(rows, today)
  if (!due.length) return []
  const { data } = await db.from('accounts').select('id, name').in('id', [...new Set(due.map((s) => s.account_id))])
  const names = new Map(((data || []) as { id: string; name: string }[]).map((a) => [a.id, a.name]))
  return due.map((s) => ({ ...s, accountName: names.get(s.account_id) ?? 'Account' }))
}
